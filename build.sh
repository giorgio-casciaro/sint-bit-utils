#/bin/bash
git add .
git commit
npm version patch
git add .
git commit -m "npm update"
git push
npm publish
#
