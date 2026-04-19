package worker

import (
	"context"
	"encoding/base64"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
)

var userAgents = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/123.0.0.0 Safari/537.36",
}

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

// TakeScreenshotBase64 navigates to the provided URL, takes a screenshot,
// and returns it as a Base64 encoded string.
func TakeScreenshotBase64(ctx context.Context, browser *rod.Browser, rawURL string) (string, error) {
	url := formatURL(rawURL)

	// Create a new page (tab) using the shared browser, bound to the job's context
	page := browser.Context(ctx).MustPage()

	// CRITICAL: Must close the page after screenshot to prevent memory leaks
	defer page.MustClose()

	_ = page.SetViewport(&proto.EmulationSetDeviceMetricsOverride{
		Width:             1920,
		Height:            1080,
		DeviceScaleFactor: 1,
		Mobile:            false,
	})

	ua := getRandomUserAgent()
	_ = page.SetUserAgent(&proto.NetworkSetUserAgentOverride{
		UserAgent:      ua,
		AcceptLanguage: "en-US,en;q=0.9",
	})

	_, _ = page.SetExtraHeaders([]string{
		"Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
		"Upgrade-Insecure-Requests", "1",
		"Sec-Fetch-Dest", "document",
		"Sec-Fetch-Mode", "navigate",
		"Sec-Fetch-Site", "none",
		"Sec-Fetch-User", "?1",
	})

	err := rod.Try(func() {
		page.Timeout(5 * time.Second).MustNavigate(url).MustWaitLoad()
	})
	if err != nil {
		// Return empty string on timeout
		if strings.Contains(err.Error(), "timeout") {
			return "", nil
		}
		return "", fmt.Errorf("failed to load page %s: %v", url, err)
	}

	quality := 80

	imgBytes, err := page.Screenshot(true, &proto.PageCaptureScreenshot{
		Format:  proto.PageCaptureScreenshotFormatJpeg,
		Quality: &quality,
		Clip: &proto.PageViewport{
			X: 0, Y: 0, Width: 1920, Height: 1080, Scale: 1,
		},
	})
	if err != nil {
		return "", fmt.Errorf("failed to take screenshot: %v", err)
	}

	return base64.StdEncoding.EncodeToString(imgBytes), nil
}
