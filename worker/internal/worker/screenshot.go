package worker

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/oasm-platform/oasm-sdk-go/oasm"
)

var (
	screenshotLog = oasm.NewLogger("Worker.Screenshot")
	userAgents    = []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/123.0.0.0 Safari/537.36",
	}
)

func getRandomUserAgent() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	return userAgents[r.Intn(len(userAgents))]
}

func formatURL(target string) string {
	target = strings.TrimSpace(target)
	if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
		return target
	}
	if strings.HasSuffix(target, ":443") || strings.HasSuffix(target, ":8443") {
		return "https://" + target
	}
	return "http://" + target
}

func TakeScreenshotBase64(ctx context.Context, browser *BrowserSession, rawURL string) (string, error) {
	url := formatURL(rawURL)
	screenshotLog.Verbose("Preparing browser context for: %s", url)

	opts := ScreenshotOpts{
		Width:     1920,
		Height:    1080,
		UserAgent: getRandomUserAgent(),
		Headers: map[string]string{
			"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
			"Upgrade-Insecure-Requests": "1",
			"Sec-Fetch-Dest":            "document",
			"Sec-Fetch-Mode":            "navigate",
			"Sec-Fetch-Site":            "none",
			"Sec-Fetch-User":            "?1",
		},
		Quality: 80,
	}

	base64Image, err := browser.TakeScreenshot(ctx, url, opts)
	if err != nil {
		if strings.Contains(err.Error(), "timeout") {
			return "", fmt.Errorf("timeout loading page %s", url)
		}
		return "", fmt.Errorf("failed to load page %s: %w", url, err)
	}

	screenshotLog.Debug("Screenshot captured successfully: %s", url)
	return base64Image, nil
}
