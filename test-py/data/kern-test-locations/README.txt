This font is constructed so that avar mapping back and forth can cause floating
point errors, so we can test the fuzzy location matching in the kerning
extraction in opentype.py. Locations in the extracted .fea data is in user
space, and we need source space, and the conversion can easily be imprecise.
