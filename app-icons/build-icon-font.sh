#!/bin/sh

set -e  # make sure to abort on error
set -x  # echo commands


fontmake -u fontra-icons.ufo -o ttf --output-dir .


python -c "\
from fontTools.ttLib import TTFont;\
f = TTFont('fontra-icons.ttf');\
f.flavor = 'woff2'; f.save('fontra-icons.woff2');\
"


mv fontra-icons.woff2 ../src/fontra/client/fonts/fontra-icons.woff2
