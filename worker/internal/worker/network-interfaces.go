package worker

import (
	"fmt"
	"log"
	"net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

// NetworkInfo represents the best network interface information
type NetworkInfo struct {
	Interface  string
	IP         string
	CIDR       string
	GatewayIP  string
	GatewayMAC string
}

// interfaceCandidate represents a candidate interface with score
type interfaceCandidate struct {
	iface net.Interface
	ip    net.IP
	ipNet *net.IPNet
	score int
}

// GetNetworkInfo returns the best network interface information
func GetNetworkInfo() (NetworkInfo, error) {
	log.Println("Starting network interface detection")

	// Get all interfaces
	ifaces, err := net.Interfaces()
	if err != nil {
		return NetworkInfo{}, fmt.Errorf("failed to get interfaces: %w", err)
	}

	// Select best interface
	candidate, err := selectBestInterface(ifaces)
	if err != nil {
		return NetworkInfo{}, fmt.Errorf("failed to select best interface: %w", err)
	}

	log.Printf("Selected interface: %s with IP: %s", candidate.iface.Name, candidate.ip.String())

	// Normalize CIDR to /24
	normalizedCIDR := normalizeCIDR(candidate.ipNet)
	log.Printf("Normalized CIDR: %s", normalizedCIDR)

	// Get gateway IP
	gatewayIP, err := getGatewayIP()
	if err != nil {
		return NetworkInfo{}, fmt.Errorf("failed to get gateway IP: %w", err)
	}

	// Validate gateway is in same subnet
	if !candidate.ipNet.Contains(gatewayIP) {
		log.Printf("Warning: gateway %s not in interface subnet %s", gatewayIP.String(), candidate.ipNet.String())
	}

	// Resolve gateway MAC
	gatewayMAC, err := resolveARP(gatewayIP)
	if err != nil {
		log.Printf("Failed to resolve gateway MAC: %v", err)
		gatewayMAC = ""
	}

	return NetworkInfo{
		Interface:  candidate.iface.Name,
		IP:         candidate.ip.String(),
		CIDR:       normalizedCIDR,
		GatewayIP:  gatewayIP.String(),
		GatewayMAC: gatewayMAC,
	}, nil
}

// selectBestInterface selects the best network interface based on scoring
func selectBestInterface(ifaces []net.Interface) (interfaceCandidate, error) {
	var candidates []interfaceCandidate

	for _, iface := range ifaces {
		// Skip if not up and running
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagRunning == 0 {
			continue
		}

		// Skip loopback
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		// Skip virtual interfaces
		if isVirtualInterface(iface.Name) {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			var ipNet *net.IPNet

			if ipAddr, ok := addr.(*net.IPAddr); ok {
				ip = ipAddr.IP
			} else if ipNetAddr, ok := addr.(*net.IPNet); ok {
				ip = ipNetAddr.IP
				ipNet = ipNetAddr
			} else {
				continue
			}

			// Must be IPv4
			if ip.To4() == nil {
				continue
			}

			// Skip link-local
			if ip.IsLinkLocalUnicast() {
				continue
			}

			// Skip loopback
			if ip.IsLoopback() {
				continue
			}

			score := 0

			// Prefer private IPv4
			if isPrivateIP(ip) {
				score += 3
			}

			// Prefer /24 subnet
			if ipNet != nil {
				if ones, _ := ipNet.Mask.Size(); ones == 24 {
					score += 2
				}
			}

			// Prefer physical interfaces
			if isPhysicalInterface(iface.Name) {
				score += 1
			} else {
				score -= 5 // Penalize virtual
			}

			candidates = append(candidates, interfaceCandidate{
				iface: iface,
				ip:    ip,
				ipNet: ipNet,
				score: score,
			})
		}
	}

	if len(candidates) == 0 {
		return interfaceCandidate{}, fmt.Errorf("no suitable interface found")
	}

	// Select highest score
	best := candidates[0]
	for _, c := range candidates[1:] {
		if c.score > best.score {
			best = c
		}
	}

	return best, nil
}

// isVirtualInterface checks if interface name indicates virtual
func isVirtualInterface(name string) bool {
	lower := strings.ToLower(name)
	virtualPatterns := []string{"vEthernet", "docker", "wsl", "br-", "bridge", "vm", "virtual"}
	for _, pattern := range virtualPatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

// isPhysicalInterface checks if interface is likely physical
func isPhysicalInterface(name string) bool {
	lower := strings.ToLower(name)
	physicalPatterns := []string{"ethernet", "wi-fi", "wifi", "lan", "eth", "wlan"}
	for _, pattern := range physicalPatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

// isPrivateIP checks if IP is in private ranges
func isPrivateIP(ip net.IP) bool {
	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
	}
	for _, cidr := range privateRanges {
		_, ipNet, _ := net.ParseCIDR(cidr)
		if ipNet.Contains(ip) {
			return true
		}
	}
	return false
}

// normalizeCIDR normalizes subnet to /24
func normalizeCIDR(ipNet *net.IPNet) string {
	if ipNet == nil {
		return ""
	}
	ip := ipNet.IP.To4()
	if ip == nil {
		return ipNet.String()
	}
	// Set mask to /24
	newMask := net.CIDRMask(24, 32)
	newIPNet := &net.IPNet{IP: ip, Mask: newMask}
	return newIPNet.String()
}

// resolveARP resolves MAC address for IP
func resolveARP(ip net.IP) (string, error) {
	switch runtime.GOOS {
	case "windows":
		return resolveARPWindows(ip)
	case "linux", "darwin":
		return resolveARPUnix(ip)
	default:
		return "", fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
}

// resolveARPWindows for Windows
func resolveARPWindows(ip net.IP) (string, error) {
	cmd := exec.Command("arp", "-a", ip.String())
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("arp command failed: %w", err)
	}
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, ip.String()) {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				mac := fields[1]
				// Normalize format
				if strings.Contains(mac, "-") {
					mac = strings.ReplaceAll(mac, "-", ":")
				}
				return strings.ToLower(mac), nil
			}
		}
	}
	return "", fmt.Errorf("MAC not found for %s", ip.String())
}

// resolveARPUnix for Linux and macOS
func resolveARPUnix(ip net.IP) (string, error) {
	cmd := exec.Command("arp", "-n", ip.String())
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("arp command failed: %w", err)
	}
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, ip.String()) {
			fields := strings.Fields(line)
			if len(fields) >= 3 {
				mac := fields[2]
				// Normalize format
				if strings.Contains(mac, "-") {
					mac = strings.ReplaceAll(mac, "-", ":")
				}
				return strings.ToLower(mac), nil
			}
		}
	}
	return "", fmt.Errorf("MAC not found for %s", ip.String())
}

// windowsRouteStruct represents a route entry from Windows route print
type windowsRouteStruct struct {
	Destination string
	Netmask     string
	Gateway     string
	Interface   string
	Metric      int
}

// parseToWindowsRouteStruct parses the output of "route print 0.0.0.0"
func parseToWindowsRouteStruct(output []byte) ([]windowsRouteStruct, error) {
	lines := strings.Split(string(output), "\n")
	defaultRoutes := make([]windowsRouteStruct, 0)
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 5 && fields[0] == "0.0.0.0" {
			metric, err := strconv.Atoi(fields[4])
			if err != nil {
				continue
			}
			defaultRoutes = append(defaultRoutes, windowsRouteStruct{
				Destination: fields[0],
				Netmask:     fields[1],
				Gateway:     fields[2],
				Interface:   fields[3],
				Metric:      metric,
			})
		}
	}
	return defaultRoutes, nil
}



// getGatewayIP returns the default gateway IP cross-platform
func getGatewayIP() (net.IP, error) {
	switch runtime.GOOS {
	case "windows":
		return getGatewayIPWindows()
	case "linux":
		return getGatewayIPLinux()
	case "darwin":
		return getGatewayIPDarwin()
	default:
		return nil, fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
}

// getGatewayIPWindows for Windows
func getGatewayIPWindows() (net.IP, error) {
	cmd := exec.Command("route", "print", "0.0.0.0")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, err
	}
	routes, err := parseToWindowsRouteStruct(output)
	if err != nil {
		return nil, err
	}
	for _, route := range routes {
		if route.Gateway != "On-link" {
			ip := net.ParseIP(route.Gateway)
			if ip != nil {
				return ip, nil
			}
		}
	}
	return nil, fmt.Errorf("no gateway found")
}

// getGatewayIPLinux for Linux
func getGatewayIPLinux() (net.IP, error) {
	cmd := exec.Command("ip", "route", "show", "default")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "default via") {
			fields := strings.Fields(line)
			for i, field := range fields {
				if field == "via" && i+1 < len(fields) {
					ip := net.ParseIP(fields[i+1])
					if ip != nil {
						return ip, nil
					}
				}
			}
		}
	}
	return nil, fmt.Errorf("no gateway found")
}

// getGatewayIPDarwin for macOS
func getGatewayIPDarwin() (net.IP, error) {
	cmd := exec.Command("netstat", "-nr")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "default") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				ip := net.ParseIP(fields[1])
				if ip != nil {
					return ip, nil
				}
			}
		}
	}
	return nil, fmt.Errorf("no gateway found")
}



