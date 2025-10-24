#!/bin/sh

echo "Updating nuclei..."
nuclei -ut

echo "Starting worker application..."
exec "$@"