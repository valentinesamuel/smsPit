package webhook

import (
	"bytes"
	"context"
	"fmt"
	"math"
	"net/http"
	"time"
)

type DeliveryResult struct {
	Success bool
	Error   string
}

func Deliver(ctx context.Context, url string, payload []byte, maxRetries int, baseBackoff time.Duration) DeliveryResult {
	var lastErr string
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(math.Pow(2, float64(attempt-1))) * baseBackoff
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return DeliveryResult{Success: false, Error: "context cancelled"}
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
		if err != nil {
			lastErr = err.Error()
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = err.Error()
			continue
		}
		resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return DeliveryResult{Success: true}
		}
		lastErr = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return DeliveryResult{Success: false, Error: lastErr}
}
