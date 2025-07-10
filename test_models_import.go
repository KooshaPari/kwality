package main

import (
	"fmt"
	"kwality/internal/models"
)

func main() {
	fmt.Println("Testing models import...")
	codebase := &models.Codebase{
		ID:   "test",
		Name: "test",
	}
	fmt.Printf("Codebase created: %+v\n", codebase)
}