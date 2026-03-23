package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func (s *Server) runQuery(c *gin.Context) {
	var body struct {
		SQL string `json:"sql"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trimmed := strings.TrimSpace(body.SQL)
	if !strings.HasPrefix(strings.ToLower(trimmed), "select") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only SELECT queries are allowed"})
		return
	}

	start := time.Now()
	rows, err := s.db.Query(trimmed)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := [][]any{}
	for rows.Next() {
		if len(result) >= 500 {
			break
		}
		vals := make([]any, len(columns))
		ptrs := make([]any, len(columns))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			continue
		}
		// Convert []byte to string for JSON friendliness
		row := make([]any, len(columns))
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				row[i] = string(b)
			} else {
				row[i] = v
			}
		}
		result = append(result, row)
	}

	durationMs := int(time.Since(start).Milliseconds())
	c.JSON(http.StatusOK, gin.H{
		"columns":     columns,
		"rows":        result,
		"count":       len(result),
		"duration_ms": durationMs,
	})
}

func (s *Server) getSchema(c *gin.Context) {
	tableRows, err := s.db.Query(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tableRows.Close()

	var tableNames []string
	for tableRows.Next() {
		var name string
		tableRows.Scan(&name)
		tableNames = append(tableNames, name)
	}
	tableRows.Close()

	type ColumnInfo struct {
		CID          int     `json:"cid"`
		Name         string  `json:"name"`
		Type         string  `json:"type"`
		NotNull      int     `json:"notnull"`
		DefaultValue *string `json:"dflt_value"`
		PK           int     `json:"pk"`
	}
	type TableSchema struct {
		Name    string       `json:"name"`
		Columns []ColumnInfo `json:"columns"`
		Sample  [][]any      `json:"sample"`
	}

	tables := []TableSchema{}
	for _, tableName := range tableNames {
		colRows, err := s.db.Query(fmt.Sprintf(`PRAGMA table_info("%s")`, tableName))
		if err != nil {
			continue
		}
		cols := []ColumnInfo{}
		for colRows.Next() {
			var col ColumnInfo
			var dflt *string
			colRows.Scan(&col.CID, &col.Name, &col.Type, &col.NotNull, &dflt, &col.PK)
			col.DefaultValue = dflt
			cols = append(cols, col)
		}
		colRows.Close()

		// Sample rows
		sampleRows, err := s.db.Query(fmt.Sprintf(`SELECT * FROM "%s" ORDER BY rowid DESC LIMIT 5`, tableName))
		sample := [][]any{}
		if err == nil {
			sampleCols, _ := sampleRows.Columns()
			for sampleRows.Next() {
				vals := make([]any, len(sampleCols))
				ptrs := make([]any, len(sampleCols))
				for i := range vals {
					ptrs[i] = &vals[i]
				}
				sampleRows.Scan(ptrs...)
				row := make([]any, len(sampleCols))
				for i, v := range vals {
					if b, ok := v.([]byte); ok {
						row[i] = string(b)
					} else {
						row[i] = v
					}
				}
				sample = append(sample, row)
			}
			sampleRows.Close()
		}

		tables = append(tables, TableSchema{
			Name:    tableName,
			Columns: cols,
			Sample:  sample,
		})
	}

	c.JSON(http.StatusOK, gin.H{"tables": tables})
}
