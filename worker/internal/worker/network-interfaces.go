package worker

import (
	"fmt"
	"net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"

	"github.com/oasm-platform/oasm-sdk-go/oasm"
)

type NetworkInfo struct {
	Interface  string
	IP         string
	CIDR       string
	GatewayIP  string
	GatewayMAC string
}

type interfaceCandidate struct {
	iface net.Interface
	ip    net.IP
	ipNet *net.IPNet
	score int
}

func GetNetworkInfos() ([]NetworkInfo, error) {
	l := oasm.NewLogger("Network")
	l.Verbose("Starting network interface detection")

	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, fmt.Errorf("failed to get interfaces: %w", err)
	}

	candidates, err := selectAllInterfaces(ifaces)
	if err != nil {
		return nil, fmt.Errorf("failed to select interfaces: %w", err)
	}

	gatewayIP, err := getGatewayIP()
	if err != nil {
		l.Warning("Failed to get gateway IP: %v", err)
		gatewayIP = nil
	}

	cidrMap := make(map[string]interfaceCandidate)
	for _, candidate := range candidates {
		normalizedCIDR := normalizeCIDR(candidate.ipNet)
		if existing, exists := cidrMap[normalizedCIDR]; !exists || candidate.score > existing.score {
			cidrMap[normalizedCIDR] = candidate
		}
	}

	var networkInfos []NetworkInfo
	for normalizedCIDR, candidate := range cidrMap {
		l.Debug("Selected interface: %s | IP: %s | CIDR: %s", candidate.iface.Name, candidate.ip.String(), normalizedCIDR)

		if gatewayIP != nil && !candidate.ipNet.Contains(gatewayIP) {
			l.Warning("Gateway %s not in interface subnet %s", gatewayIP.String(), candidate.ipNet.String())
		}

		gatewayMAC := ""
		if gatewayIP != nil {
			gatewayMAC, err = resolveARP(gatewayIP)
			if err != nil {
				l.Warning("Failed to resolve gateway MAC: %v", err)
			}
		}

		networkInfos = append(networkInfos, NetworkInfo{
			Interface:  candidate.iface.Name,
			IP:         candidate.ip.String(),
			CIDR:       normalizedCIDR,
			GatewayIP:  gatewayIP.String(),
			GatewayMAC: gatewayMAC,
		})
	}

	return networkInfos, nil
}

func selectAllInterfaces(ifaces []net.Interface) ([]interfaceCandidate, error) {
	var candidates []interfaceCandidate

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagRunning == 0 {
			continue
		}

		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}

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

			if ip.To4() == nil {
				continue
			}

			if ip.IsLinkLocalUnicast() {
				continue
			}

			if ip.IsLoopback() {
				continue
			}

			score := 0

			if isPrivateIP(ip) {
				score += 3
			}

			if ipNet != nil {
				if ones, _ := ipNet.Mask.Size(); ones == 24 {
					score += 2
				}
			}

			if isPhysicalInterface(iface.Name) {
				score += 1
			} else {
				score -= 5
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
		return nil, fmt.Errorf("no suitable interface found")
	}

	return candidates, nil
}

func isVirtualInterface(name string) bool {
	lower := strings.ToLower(name)
	virtualPatterns := []string{"vethernet", "docker", "wsl", "br-", "bridge", "vm", "virtual", "tailscale"}
	for _, pattern := range virtualPatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

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

func normalizeCIDR(ipNet *net.IPNet) string {
	if ipNet == nil {
		return ""
	}
	ip := ipNet.IP.To4()
	if ip == nil {
		return ipNet.String()
	}
	newMask := net.CIDRMask(24, 32)
	newIPNet := &net.IPNet{IP: ip, Mask: newMask}
	return newIPNet.String()
}

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

func resolveARPWindows(ip net.IP) (string, error) {
	cmd := exec.Command("arp", "-a")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("arp command failed: %w", err)
	}
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, ip.String()) {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				mac := fields[1]
				if strings.Contains(mac, "-") {
					mac = strings.ReplaceAll(mac, "-", ":")
				}
				return strings.ToLower(mac), nil
			}
		}
	}
	return "", fmt.Errorf("MAC not found for %s", ip.String())
}

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
				if strings.Contains(mac, "-") {
					mac = strings.ReplaceAll(mac, "-", ":")
				}
				return strings.ToLower(mac), nil
			}
		}
	}
	return "", fmt.Errorf("MAC not found for %s", ip.String())
}

type windowsRouteStruct struct {
	Destination string
	Netmask     string
	Gateway     string
	Interface   string
	Metric      int
}

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
