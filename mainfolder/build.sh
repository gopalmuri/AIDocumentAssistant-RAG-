#!/usr/bin/env bash
# Exit on error
set -o errexit

# Install dependencies
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# Convert static asset paths
python backend/manage.py collectstatic --no-input

# Apply any outstanding database migrations
python backend/manage.py migrate
