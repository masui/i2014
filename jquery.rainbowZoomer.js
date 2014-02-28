//
// jQueryに書き直したがあまりメリットが感じられていない (2013/01/24 09:37:12)
// ajaxが必要になれば違うかも
// 
// zoomer = $('#div1').rainbowZoomer(config);
// zoomer.update();
//

(function($){
    $.fn.rainbowZoomer=function(config){
        // デフォルトオプション
        var defaults = {
	    entries: [{}],
	    clickzoom: false,
	    textspan: false,
	    granularity: 20.0,
	};
        var options = $.extend(defaults, config);
	
	this.width = Number(this.css('width').match(/[0-9]+/));
	this.height = Number(this.css('height').match(/[0-9]+/));
	// clip:rect(0px,720px,630px,0px) のようなCSS
	this.css('clip','rect(0px,'+this.css('width')+','+this.css('height')+',0px)');
	
	this.entries = options.entries;
	this.indentCount = []; // インデントがnのデータがindentCount[n]個存在
	this.indentBits = [];  // indentCount[n]個のデータを表現するのに必要なビット数
	this.maxindent = 0;        // インデントの最大値
	this.maxDOI = 0;
	this.indentLevel = [];    // インデントがnのときレベルがindentLevel[n]になる
	this.countmatch = [];
	this.countnomatch = [];
	this.zoom = 5.0;
	this.fzoom = 0.0;
	this.izoom = 0;
	this.offsety = 0.0;
	this.clickedentry = null;

	this.down = false;
	this.origzoom = 0;         // クリックしたときのthis.zoom値
	this.origoffset = 0;       // クリックしたときのdiv(?)の位置
	this.origclickedtop = 0;
	this.origx = 0;            // クリックしたときのX座標
	this.origy = 0;
	
	this.clickZoom = options.clickzoom;
	this.granularity = options.granularity;
	this.multitap = false;
	this.dist = 0;
	this.origdist = 0;

	this.nelements = 0;
	this.elements = [];
	this.textspan = options.textspan;

	
	// 関数
	this.initData = initData;
	this.update = update;
	this.setGranularity = setGranularity;
	this.calcdoi = calcdoi;
	this.calcpos = calcpos;
	this.display = display;
	//this.rainbowColor = rainbowColor;
	this.calcEntryPositions = calcEntryPositions;
	this.defaultDiv = defaultDiv;
	this.defaultSizeFunction = defaultSizeFunction;
	//this.mousedown = mousedown;
	//this.mouseup = mouseup;
	//this.mousemove = mousemove;
	
	this.initData();
	
	//
	// 描画Canvas作成
	//
	var canvas = $("<canvas>");
	canvas.css('position','absolute');
	canvas.css('width',this.width);
	canvas.css('height',this.height);
	canvas.css('offsetTop',0);
	canvas.css('offsetLeft',0);
	// これが曲者!! jQueryオブジェクトではなくJSオブジェクトに対してwidthなど設定の必要あり
	canvas[0].width = this.width;
	canvas[0].height = this.height;
	this.canvas = canvas;
	this.append(canvas);
	
	//
	// イベント関連
	//
	this.on('mousedown touchstart',this,mousedown);
	this.on('mouseup touchend',this,mouseup);
	this.on('mousemove touchmove',this,mousemove);
	//
	// jQueryでもホイールイベント使えるっぽい
	this.on('DOMMouseScroll',this,wheel);
	this.on('mousewheel',this,wheel);

	this.moved = false;

	return this;
    };

    var initData = function(){
	//
	// データ初期化
	//
	var i;
	for(i=0;i<this.entries.length;i++){
	    this.entries[i].index = i;
	}
	this.maxindent = -1;
	for(i=0;i<this.entries.length;i++){
	    var ind = this.entries[i].indent;
	    if(! this.indentCount[ind]) this.indentCount[ind] = 0;
	    this.indentCount[ind]++;
	    if(ind > this.maxindent) this.maxindent = ind;
	}
	for(i=0;i<=this.maxindent;i++){
	    this.indentBits[i] = bits(this.indentCount[i]);
	    this.indentLevel[i] = (i == 0 ? 0 : this.indentLevel[i-1] + this.indentBits[i-1]);
	}
	for(i=0,this.maxDOI=0;i<=this.maxindent;i++){
	    this.maxDOI += bits(this.indentCount[i]);
	}
	this.maxDOI += 1;
	var indententry = [];
	for(i=0;i<this.entries.length;i++){
	    var entry = this.entries[i];
	    entry.height = 20;
	    entry.width = 0; // widthが0でないときは並べていく
	    entry.matched = false;
	    entry.x = [];
	    entry.y = [];
	    entry.displayed = [];
	    if(!entry.div) entry.div = this.defaultDiv;
	    if(!entry.size) entry.size = this.defaultSizeFunction;
	    entry.parent = null;
	    for(var indent=entry.indent-1;indent >= 0;indent--){
		if(indententry[indent]){
		    entry.parent = indententry[indent];
		    break;
		}
	    }
	    indententry[entry.indent] = entry;
	}
    };

    // 数字を何ビットで表現できるか計算 bits(7) = 3
    var bits = function(n){
	var i,b;
	for(b=0,i=1;i<n;b++) i *= 2;
	if(b == 0) b = 1;
	return b;
    };

    var mousedown = function(e){
	e.preventDefault();

	var rz = e.data;
	rz.moved = false;
	var offsetTop = rz.offset().top;
	var offsetLeft = rz.offset().left;

	var pageX1 = e.pageX;
	var pageY1 = e.pageY;
	var pageX2 = null;
	var pageY2 = null;

	touches = false;
	if(e.originalEvent.touches && e.originalEvent.touches.length > 0) {
            touches = e.originalEvent.touches;
	} else if(e.originalEvent.changedTouches && e.originalEvent.changedTouches.length > 0){
            touches = e.originalEvent.changedTouches;
	}
	rz.multitap = false;
	if(touches){ // マルチタッチ機器
	    pageX1 = touches[0].pageX;
	    pageY1 = touches[0].pageY;
	    if(touches.length > 1){
		pageX2 = touches[1].pageX;
		pageY2 = touches[1].pageY;
		rz.multitap = true;
		rz.origzoom = rz.zoom;
		rz.origdist = Math.abs(pageY1 - pageY2);
		rz.dist = rz.origdist;
	    }
	}
	if(! rz.multitap){ // クリック or 1タップ目
	    // リンクをクリックしたときはジャンプするようにする
	    // !!! 美しくないので修正するべき
// 2013/2/25
//	    if(e.target.href != undefined){
//		location.href = e.target.href;
//		return;
//	    }
	    
	    rz.clickedentry = null;
	    for(var i=0;i<rz.entries.length;i++){
		var entry = rz.entries[i];
		if(entry.displayed[0] &&
		   pageY1-offsetTop >= entry.top + rz.offsety &&
		   pageX1-offsetLeft >= entry.left &&
		   (entry.width == 0 || pageX1-offsetLeft < entry.left+entry.width)){
		    rz.clickedentry = entry;
		    rz.origclickedtop = rz.clickedentry.top;
		}
	    }
	    if(rz.clickedentry){
		if(rz.clickedentry.lat){
		    var latlng = new google.maps.LatLng(rz.clickedentry.lat,rz.clickedentry.long);
		    map.setCenter(latlng);
		    ignoreNextZoom = true;
		    map.setZoom(12);
		}

		rz.calcdoi();
		rz.clickedentry.doi = -1000; // クリックしたエントリは消えないようにする
		
		// クリックしたエントリと同じレベルのエントリと親エントリを表示する
		// ...という単純なやり方はマズい。どういう工夫をすべきか?
		if(rz.clickZoom){
		    var indent = rz.clickedentry.indent;
		    for(var i = rz.clickedentry.index;i>=0 && rz.entries[i].indent == indent; i--){
			rz.entries[i].doi = -100;
		    }
		    for(var i = rz.clickedentry.index;i<rz.entries.length && rz.entries[i].indent == indent; i++){
			rz.entries[i].doi = -100;
		    }
		    
		    for(var parent = rz.clickedentry.parent;parent;parent = parent.parent){
			parent.doi = -100;
		    }
		}
	    }
	    rz.down = true;
	    rz.origzoom = rz.zoom;
	    rz.origoffset = rz.offsety;
	    rz.origx = pageX1-offsetLeft;
	    rz.origy = pageY1-offsetTop;
	}
    };

    var calcdoi = function(){
	var i,j,k;
	var mask;
	
	for(i=0;i<=this.maxindent;i++){
	    this.countmatch[i] = 1;
	    this.countnomatch[i] = 1;
	}
	
	for(i=0;i<this.entries.length;i++){
	    var entry = this.entries[i];
	    var indent = entry.indent;
	    var b = this.indentBits[indent];
	    if(entry.matched){
		for(mask=1,j=0;j<b;j++,mask<<=1){
		    if(mask & this.countmatch[indent]) break;
		}
		entry.doi = this.indentLevel[indent] + b - j - 1 - this.maxDOI;
		this.countmatch[indent]++;
	    }
	    else {
		for(mask=1,j=0;j<b;j++,mask<<=1){
		    if(mask & this.countnomatch[indent]) break;
		}
		entry.doi = this.indentLevel[indent] + b - j;
		this.countnomatch[indent]++;
	    }
	}
    };

    var mouseup = function(e){
	e.preventDefault();

	var rz = e.data;
	var offsetTop = rz.offset().top;
	var offsetLeft = rz.offset().left;

	var pageX1 = e.pageX;
	var pageY1 = e.pageY;
	var pageX2 = null;
	var pageY2 = null;

	touches = false;
	if(e.originalEvent.touches && e.originalEvent.touches.length > 0) {
            touches = e.originalEvent.touches;
	} else if(e.originalEvent.changedTouches && e.originalEvent.changedTouches.length > 0){
            touches = e.originalEvent.changedTouches;
	}
	//var touches = e.originalEvent.touches;
	//var touches = e.originalEvent.changedTouches;
	//var touches = e.changedTouches;
	//alert(touches.length);
	//if(touches && touches.length > 0){ // マルチタッチ機器
	//alert(e.changedTouches);
	//alert(e.originalEvent.touches.length);
	if(touches){ // マルチタッチ機器
	    pageX1 = touches[0].pageX;
	    pageY1 = touches[0].pageY;
	    if(touches.length > 1){
		pageX2 = touches[1].pageX;
		pageY2 = touches[1].pageY;
		rz.multitap = true;
		rz.origzoom = rz.zoom;
		rz.origdist = Math.abs(pageY1 - pageY2);
		rz.dist = rz.origdist;
	    }
	}
	if(rz.multitap){
	    // マルチタップ状態から指をひとつ離したところ。
	    // 最初に指をタップしたのと同じ状況にする。
	    rz.clickedentry = null;
	    for(var i=0;i<rz.entries.length;i++){
		var entry = rz.entries[i];
		if(entry.displayed[0] &&
		   pageY1-offsetTop >= entry.top + rz.offsety &&
		   pageX1-offsetLeft >= entry.left &&
		   (entry.width == 0 || pageX1-offsetLeft < entry.left+entry.width)){
		    rz.clickedentry = entry;
		    rz.origclickedtop = rz.clickedentry.top;
		}
	    }
	    rz.down = true;
	    rz.origzoom = rz.zoom;
	    rz.origoffset = rz.offsety;
	    rz.origx = pageX1-offsetLeft;
	    rz.origy = pageY1-offsetTop;
	}
	else {
	    rz.down = false;
	}

	if(rz.fzoom > 0.5){
	    //rz.zoom = Math.floor(rz.zoom)+1;
	}
	else {
	    //rz.zoom = Math.floor(rz.zoom);
	}

	rz.calcpos();
	if(rz.clickedentry){
	    rz.offsety = rz.origoffset + (pageY1-offsetTop - rz.origy) - (rz.clickedentry.top - rz.origclickedtop);

	    if(!rz.moved && rz.clickedentry.keyword){
		location.href = 'http://www.interaction-ipsj.org/2014/bib.php?'+rz.clickedentry.keyword;
		//window.open('http://www.interaction-ipsj.org/2014/bib.php?'+rz.clickedentry.keyword).blur();
	    }
	}
	rz.display();
	//$('#log').text(rz.zoom);

	rz.multitap = false;
    };

    var mousemove = function(e){

	e.preventDefault();
	var rz = e.data;
	rz.moved = true;

	var pageX1 = e.pageX;
	var pageY1 = e.pageY;
	var pageX2 = null;
	var pageY2 = null;

	touches = false;
	if(e.originalEvent.touches && e.originalEvent.touches.length > 0) {
            touches = e.originalEvent.touches;
	} else if(e.originalEvent.changedTouches && e.originalEvent.changedTouches.length > 0){
            touches = e.originalEvent.changedTouches;
	}

	////var touches = e.originalEvent.touches;
	//var touches = e.originalEvent.changedTouches;

	//var touches = e.originalEvent.changedTouches;
	//if(touches){ // マルチタッチ機器
	if(touches && touches.length > 0){ // マルチタッチ機器
	    //alert(touches);
	    pageX1 = touches[0].pageX;
	    pageY1 = touches[0].pageY;
	    if(touches.length > 1){
		pageX2 = touches[1].pageX;
		pageY2 = touches[1].pageY;
		rz.dist = Math.abs(pageY1 - pageY2);
		rz.multitap = true;
	    }
	}
	if(rz.down){
	    var offsetTop = rz.offset().top;
	    var offsetLeft = rz.offset().left;
	    if(rz.multitap){
		rz.zoom = rz.origzoom + Math.log(rz.dist/rz.origdist)/Math.log(2.0);
		//$('#log').text(rz.zoom);
		if(rz.zoom < 3.0) rz.zoom = 3.0;
		if(rz.zoom > rz.maxDOI) rz.zoom = rz.maxDOI;
		rz.calcpos();
		if(rz.clickedentry){
		    rz.offsety = rz.origoffset + (pageY1-offsetTop - rz.origy) - (rz.clickedentry.top - rz.origclickedtop);
		}

		rz.display();
	    }
	    else {
		rz.zoom = rz.origzoom + (pageX1-offsetLeft - rz.origx) / rz.granularity;
		if(rz.zoom < 3.0) rz.zoom = 3.0;
		if(rz.zoom > rz.maxDOI) rz.zoom = rz.maxDOI;
		//$('#log').text('N'+rz.zoom);
		rz.calcpos();
		if(rz.clickedentry){
		    // スレシホールド設定
		    // ある程度上下に移動したときのみスクロール
		    var d = pageY1-offsetTop-rz.origy;
		    if(d >= 0.0){
			if(d < 10.0) d = 0.0;
			else d = d - 10.0;
		    }
		    else {
			if(d > -10.0) d = 0.0;
			else d = d + 10.0;
		    }
		    rz.offsety = rz.origoffset + d - (rz.clickedentry.top - rz.origclickedtop);
		}
		rz.display();
	    }
	}
    };

    // http://www.adomas.org/javascript-mouse-wheel/
    var wheel = function(e){
	e.preventDefault();
	var rainbowzoomer = e.data;
	if(rainbowzoomer){
	    if(e.originalEvent.detail){ // Mozilla
		rainbowzoomer.offsety -= e.originalEvent.detail;
	    }
	    else {
		rainbowzoomer.offsety -= e.originalEvent.wheelDelta / 3;
	    }
	    //if(rainbowzoomer.offset < -10) rainbowzoomer.offset = -10;
	    if(rainbowzoomer.offsety > rainbowzoomer.maxPosY) rainbowzoomer.offsety = rainbowzoomer.maxPosY;
	    rainbowzoomer.display();
	}
    };

    var calcpos = function(){
	var i, entry;
	this.izoom = Math.floor(this.zoom);
	this.fzoom = this.zoom - this.izoom;
	// izoomのレベルとizoom+1のレベルで表示すべき行を計算
	// (izoom+1の方が表示が多いようにする)
	var count = 0;
	for(i=0;i<this.entries.length;i++){
	    entry = this.entries[i];
	    entry.displayed[0] = (entry.doi < this.izoom);
	    entry.displayed[1] = (entry.doi < this.izoom+1);
	    if(entry.displayed[0]){
		entry.displayCount = count++;
	    }
	}
	// izoom, izoom+1の表示位置を計算する
	this.calcEntryPositions(0);
	this.calcEntryPositions(1);
	
	// 間を補間
	for(i=0;i<this.entries.length;i++){
	    entry = this.entries[i];
	    if(entry.displayed[0]){
		entry.top = Math.floor(entry.y[0] * (1.0-this.fzoom) + entry.y[1] * this.fzoom);
		entry.left = entry.x[0] * (1.0-this.fzoom) + entry.x[1] * this.fzoom;
		entry.width = 0;
	    }
	}
    };

    var calcEntryPositions = function(ind){
	var posy = 0.0;
	var posx = 0.0;
	//var count = 0;
	var maxheight = 0;
	for(var i=0;i<this.entries.length;i++){
	    var entry = this.entries[i];
	    if(entry.displayed[ind]){
		var size = entry.size(entry);
		if(size.width == 0){ // 1エントリだけ表示
		    if(posx != 0.0){
			posy += maxheight;
			posx = 0.0;
		    }
		    entry.y[ind] = posy;
		    entry.x[ind] = 10.0 + entry.indent * 20.0;
		    posy += entry.height;
		    maxheight = 0;
		}
		else {
		    if(entry.indent * 20.0 + posx + size.width > this.width){// あふれ
			posy += maxheight;
			posx = 0.0;
			maxheight = 0;
		    }
		    entry.y[ind] = posy;
		    entry.x[ind] = entry.indent * 20.0 + posx;
		    posx += size.width;
		    if(size.height > maxheight) maxheight = size.height;
		}
	    }
	}
	this.maxPosY = posy;
    };

    var display = function(obj){
	if(!this.textspan){
	    this.children().remove();
	    this.append(this.canvas); // なんでこうするの?
	}

	this.nelements = 0;

	var ctx = this.canvas[0].getContext('2d'); // jQueryは配列になってるらしいのでこういう細工が必要
	//var ctx = this.canvas.getContext('2d');
	ctx.setTransform(1.0,0.0,0.0,1.0,0.0,0.0);
	
	// バックグラウンド消去
	ctx.fillStyle = 'rgb(240,240,240)';
	ctx.fillRect(0,0,this.width,this.height);
	
	var indentLength = []; // 同じインデントレベルがいくつ並んでいるか (縦書き対応)
	var parentEntries = [];
	var oldParentEntries = [];
	var oldindex = 0;
	for(var i=0;i<this.maxindent;i++){
	    indentLength[i] = 0;
	}

	var ind,i;
	var lim = -200 - this.offsety;
	for(ind=0;ind<this.entries.length;ind++){
	    var entry = this.entries[ind];
	    if(entry.displayed[0]){
		if(entry.top > lim) break;
	    }
	}
	lim = this.height - this.offsety;
	var nentries = this.entries.length;
	for(var i=ind;i<nentries;i++){
	    var entry = this.entries[i];
	    if(entry.displayed[0]){
		if(entry.top >= lim) break;
		ctx.setTransform(1.0,0.0,0.0,1.0,0.0,0.0);
		var parents = [];
		for(var parent = entry.parent;parent;parent = parent.parent){
		    parents.push(parent);
		}
		for(var j=parents.length-1;j>=0;j--){
		    for(var k=parents[j].indent;k<this.maxindent;k++){
			parentEntries[k] = parents[j];
		    }
		}
		for(var k=entry.indent;k<this.maxindent;k++){
		    parentEntries[k] = entry;
		}
		for(var j=parents.length-1;j>=0;j--){
		    var parent = parents[j];
		    ctx.fillStyle = rainbowColor(parent.str); // !!! colorは初期化時に計算しておくべき
		    ctx.fillRect(parent.left-5,entry.top+this.offsety,this.width-(parent.left-5),300);
		    if(oldParentEntries[parent.indent] != parentEntries[parent.indent]){
			ctx.strokeStyle = 'rgb(255,255,255)';
			ctx.beginPath();
			ctx.lineWidth = 1;
			ctx.moveTo(parent.left-5,entry.top+this.offsety+2);
			ctx.lineTo(this.width,entry.top+this.offsety+2);
			ctx.stroke();
		    }
		    ctx.beginPath();
		    ctx.strokeStyle = 'rgb(255,255,255)';
		    ctx.lineWidth = 1;
		    ctx.moveTo(parent.left-5,entry.top+this.offsety);
		    ctx.lineTo(parent.left-5,entry.top+this.offsety+2+300);
		    ctx.stroke();
		}
		for(var j=0;j<=this.maxindent;j++){
		    if(oldParentEntries[j] == parentEntries[j]){
			indentLength[j] += 1;
		    }
		    else {
			indentLength[j] = 0;
		    }
		    oldParentEntries[j] = parentEntries[j];
		}
		
		var col = rainbowColor(entry.str); // !!!
		ctx.fillStyle = col;
		ctx.fillRect(entry.left-5,entry.top+this.offsety,800,300);
		
		// 項目間の区切り線
		ctx.strokeStyle = 'rgb(255,255,255)';
		if(entry.index != oldindex+1){ // 項目間の大きさに応じて暗さを変える
		    var d = entry.index - oldindex;
		    var gray = 0;
		    if(d > 20){ gray = 20; }
		    else if(d > 20){ gray = 60; }
		    else if(d > 10){ gray = 100; }
		    else if(d > 5){ gray = 140; }
		    else gray = 180;
		    ctx.strokeStyle = 'rgb('+gray+','+gray+','+gray+')';
		}
		oldindex = entry.index;
		ctx.beginPath();
		ctx.lineWidth = 2;
		ctx.moveTo(entry.left-5,entry.top+this.offsety+2);
		ctx.lineTo(this.width,entry.top+this.offsety+2);
		ctx.stroke();
		
		ctx.strokeStyle = 'rgb(255,255,255)';
		ctx.beginPath();
		ctx.lineWidth = 1;
		ctx.moveTo(entry.left-5,entry.top+this.offsety+1);
		ctx.lineTo(entry.left-5,entry.top+this.offsety+3+300);
		ctx.stroke();
		
		// 親の縦書き表示
		ctx.save();
		ctx.rotate(-90 * Math.PI / 180);
		ctx.font = "14px Helvetica";
		ctx.fillStyle = "#777";
		for(var indent=0;indent<=this.maxindent;indent++){
		    if(indentLength[indent] >= 6 && entry.displayCount % 10 == 6){
			var x,y;
			y = indent * 20 + 20;
			x = -(entry.top+this.offsety);
			// indentLength[indent] = 0;
			ctx.fillText(oldParentEntries[indent].str,x,y);
		    }
		}
		ctx.restore();

		if(this.textspan || true){
		    ctx.font = "12px Helvetica";
		    ctx.fillStyle = "#000";
		    var x = entry.left;
		    var y = entry.top + this.offsety-3+20;
		    ctx.fillText(entry.str,x,y);
		}
		else {
		}
		/*
		if(this.textspan){
		    if(this.nelements < this.elements.length){
			var e = this.elements[this.nelements];
			e.text(entry.str);
			e.css('left',entry.left);
			e.css('top',entry.top + this.offsety);
		    }
		    else {
			var e = $("<span>");
			e.text(entry.str);
			e.css('position','absolute');
			//e.css('white-space','nowrap'); // 改行抑制
			e.css('left',entry.left);
			e.css('top',entry.top + this.offsety);
			this.append(e);
			this.elements.push(e);
		    }
		    this.nelements++;
		}
		else {
		    this.append(entry.div(this));
		}
		 */
	    }
	}
	for(var i=this.nelements;i<this.elements.length;i++){
	    this.elements[i].text('');
	}
    };

    var update = function(zoom,offset){
	this.zoom = (zoom ? zoom : 7.0);
	this.calcdoi();
	this.calcpos();
	this.offsety = (offset ? offset : 0.0);
	this.display();
    };

    var setGranularity = function(v){
	this.granularity = v;
    };

    var rainbowColor = function(s){ // 虹色ぽいものを生成
	var val = 0;
	for(var i=0;i<s.length;i++){
	    val = (val * 1234567 + s.charCodeAt(s.length-i-1)) % 9876;
	}
	var r,g,b;
	r = val % 56 + 200;
	g = val % 50 + 200;
	b = val % 48 + 200;
	return 'rgb('+r+','+g+','+b+')';
    };

    var defaultDiv = function(rainbowzoomer){
	var e = this.divCache;
	if(e){
	    e.css('left',this.left);
	    e.css('top',this.top + rainbowzoomer.offsety);
	}
	else {
	    e = $("<span>");
	    e.text(this.str);
	    e.css('position','absolute');
	    e.css('white-space','nowrap'); // 改行抑制
	    e.css('left',this.left);
	    e.css('top',this.top + rainbowzoomer.offsety);
	    this.divCache = e;
	}
	return e;
    };

    var defaultSizeFunction = function(entry){
	size = {};
	size.width = entry.width;
	size.height = entry.height;
	return size;
    };
})(jQuery);
