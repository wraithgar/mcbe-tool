#!/bin/sh
mkdir -p resourcepacktemplate
cd resourcepacktemplate
curl -L https://aka.ms/resourcepacktemplate -o resourcepacktemplate.zip
unzip resourcepacktemplate.zip
