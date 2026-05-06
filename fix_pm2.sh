#!/bin/bash
ssh matthieudelamourd@macmini.local << 'INNER_EOF'
cd /Users/matt/dev/project/web/stargazer
pm2 restart all
pm2 logs stargazer-backend --lines 20
INNER_EOF
