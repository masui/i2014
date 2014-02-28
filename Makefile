all:
	ruby conv > i2014.js
upload:
	scp index.html jquery.rainbowZoomer.js i2014.js favicon.ico pitecan.com:/www/www.pitecan.com/i2014
	scp index.html jquery.rainbowZoomer.js i2014.js favicon.ico masui.org:/home/masui/www/i
