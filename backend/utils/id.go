package utils

import (
	"crypto/rand"
	"math/big"
)


func GenerateReadableID() string {
	min := int64(1000000000)
	max := int64(9999999999)
	
	n, err := rand.Int(rand.Reader, big.NewInt(max-min+1))
	if err != nil {
		return "1234567890"
	}
	
	return string(n.Int64() + min)
}