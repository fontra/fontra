#!/bin/bash

set -e  # make sure to abort on error
set -x  # echo commands

python -m fontra.core.classes > src-js/fontra-core/src/classes.json
