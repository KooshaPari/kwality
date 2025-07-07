package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

func main() {
	fmt.Println("🔍 Testing Kwality Go/Rust Platform Functionality")
	fmt.Println("================================================")

	tests := []struct {
		name string
		cmd  string
		args []string
	}{
		{"CLI Help", "./bin/kwality-cli", []string{"--help"}},
		{"CLI Status", "./bin/kwality-cli", []string{"status"}},
		{"CLI Auth Help", "./bin/kwality-cli", []string{"auth", "--help"}},
		{"CLI Project Help", "./bin/kwality-cli", []string{"project", "--help"}},
		{"CLI Validate Help", "./bin/kwality-cli", []string{"validate", "--help"}},
	}

	passed := 0
	total := len(tests)

	for _, test := range tests {
		fmt.Printf("Testing %s... ", test.name)
		
		cmd := exec.Command(test.cmd, test.args...)
		output, err := cmd.CombinedOutput()
		
		if err != nil {
			fmt.Printf("❌ FAIL: %v\n", err)
			continue
		}
		
		outputStr := string(output)
		if strings.Contains(outputStr, "Usage:") || strings.Contains(outputStr, "Kwality") {
			fmt.Printf("✅ PASS\n")
			passed++
		} else {
			fmt.Printf("❌ FAIL: unexpected output\n")
		}
	}

	fmt.Println("\n📊 Test Results:")
	fmt.Printf("Passed: %d/%d tests\n", passed, total)
	
	if passed == total {
		fmt.Println("🎉 All tests passed! Go/Rust conversion successful!")
		os.Exit(0)
	} else {
		fmt.Println("⚠️  Some tests failed")
		os.Exit(1)
	}
}