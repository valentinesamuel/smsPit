package otp

import (
	"fmt"
	"regexp"
	"sort"
)

type Detector struct {
	pattern     *regexp.Regexp
	extractMode string // all | first | longest
}

func NewDetector(minLen, maxLen int, extractMode string) *Detector {
	pattern := regexp.MustCompile(fmt.Sprintf(`\b\d{%d,%d}\b`, minLen, maxLen))
	return &Detector{
		pattern:     pattern,
		extractMode: extractMode,
	}
}

func (d *Detector) Detect(text string) []string {
	matches := d.pattern.FindAllString(text, -1)
	if len(matches) == 0 {
		return nil
	}
	switch d.extractMode {
	case "first":
		return matches[:1]
	case "longest":
		sort.Slice(matches, func(i, j int) bool {
			return len(matches[i]) > len(matches[j])
		})
		return matches[:1]
	default: // "all"
		return matches
	}
}
