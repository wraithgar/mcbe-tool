# MCBE Level Explorer

Gar messes around w/ minecraft bedrock level parsing. Almost certainly
doesn't work.

You'll need the resourcepacktemplate downloaded to work.
`./bin/download.sh` should download it where it needs to go.

### Notes

Started with a rough rewrite of https://github.com/papyrus-mc/papyrusjs
Biome Types taken from https://minecraft.fandom.com/wiki/Biome/ID
Other info gleaned from https://github.com/mmccoo/minecraft_mmccoo/blob/master/parse_bedrock.cpp
Runtime id table from https://gist.github.com/Tomcc/ad971552b024c7619e664d0377e48f58
Subchunk data format https://gist.github.com/Tomcc/a96af509e275b1af483b25c543cfbf37#the-new-subchunk-format
Chunk key info taken from https://minecraft.fandom.com/wiki/Bedrock_Edition_level_format#Mojang_variant_LevelDB_format


This will NOT work fully until https://github.com/extremeheat/node-leveldb-zlib/issues/8 is fixed. Patching that module locally will get things limping along till then.
