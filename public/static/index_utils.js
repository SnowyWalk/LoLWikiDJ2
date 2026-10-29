/* 유튜브 주소 파싱 */
var youtubeReg = /(\?|&)v=([^&\?]+)/
var youtubeReg2 = /\/v\/([^\/]+)/
var youtubeReg3 = /youtu\.be\/([^\?]+)/
var youtubeReg4 = /shorts\/([^\?]+)/

function youtube_url_parse(url_or_id)
{
	if(youtubeReg.test(url_or_id))
		return youtubeReg.exec(url_or_id)[2]
	else if(youtubeReg2.test(url_or_id))
		return youtubeReg2.exec(url_or_id)[1]
	else if(youtubeReg3.test(url_or_id))
		return youtubeReg3.exec(url_or_id)[1]
	else if(youtubeReg4.test(url_or_id))
		return youtubeReg4.exec(url_or_id)[1]
	return url_or_id
}

/* 유튜브 재생목록 주소 파싱 */
var youtubePlaylistReg = /list=([^&]+)/
function youtube_playlist_url_parse(url_or_id)
{
	if(youtubePlaylistReg.test(url_or_id))
		return youtubePlaylistReg.exec(url_or_id)[1]
	
	return url_or_id
}

function twitch_url_parse(url)
{
	if(url.endsWith('/videos'))
		url = url.replace('/videos', '')
	return url.replace(/https:\/\//i, '').replace(/www\.twitch\.tv\//i, '')
}

/* 90 -> "01:30" */
function second_to_string(sec) 
{
	if(!sec)
		return "LIVE"

	sec = Math.round(sec)
	var h = Math.floor(sec / 3600)
	sec -= h * 60 * 60
	var m = Math.floor(sec / 60)
	sec -= m * 60
	var s = sec

	if(m < 10)
		m = '0' + m.toString()
	if(s < 10)
		s = '0' + s.toString()
	if(h > 0)
		return h + ':' + m + ':' + s
	return m + ':' + s
}

function copyToClipboard(text)
{
	var textarea = document.createElement('textarea')
	textarea.value = text
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'absolute';
	textarea.style.left = '-9999px';
	document.body.appendChild(textarea);
	textarea.select()
	document.execCommand('copy');
	document.body.removeChild(textarea);
}

function selectRange(obj) 
{
	if (window.getSelection)
		window.getSelection().selectAllChildren(obj)
	else if (document.body.createTextRange) 
	{
		var range = document.body.createTextRange()
		range.moveToElementText(obj)
		range.select()
	}
}

function format() 
{ 
	var args = Array.prototype.slice.call (arguments, 1); 
	return arguments[0].replace (/\{(\d+)\}/g, function (match, index) { return args[index]; }); 
}

// [v2] 새 채팅 디자인: 맨 아래로 순간이동하지 않고 짧게(180ms) 부드럽게 따라 내려간다.
// 내려가는 도중에도 '맨 아래에 있음'으로 취급하고, 사용자가 휠/터치로 직접 스크롤하면 바로 멈춘다.
var g_chat_scroll_anim = 0
function scrollDown()
{
	var smooth = typeof g_chat_modern != 'undefined' && g_chat_modern && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
	if(!smooth)
	{
		chat.scrollTop = chat.scrollHeight
		return
	}

	cancelAnimationFrame(g_chat_scroll_anim)
	var start = chat.scrollTop
	var start_time = performance.now()
	function step(now)
	{
		var target = chat.scrollHeight - chat.clientHeight
		var t = Math.min(1, (now - start_time) / 180)
		var eased = 1 - Math.pow(1 - t, 3)
		chat.scrollTop = start + (target - start) * eased
		g_chat_scroll_anim = t < 1 ? requestAnimationFrame(step) : 0
	}
	g_chat_scroll_anim = requestAnimationFrame(step)
}

function stop_chat_scroll_animation()
{
	cancelAnimationFrame(g_chat_scroll_anim)
	g_chat_scroll_anim = 0
}

function is_scroll_bottom(offset = 0)
{
	if(g_chat_scroll_anim)
		return true
	if(offset > 0)
		console.log(offset, chat.scrollHeight-chat.scrollTop, chat.clientHeight+offset, chat.scrollHeight-chat.scrollTop <= chat.clientHeight+offset ? 'bottom' : 'scrolled')
	return chat.scrollHeight-chat.scrollTop <= chat.clientHeight+offset+20
}

function clamp(val, min, max)
{
	if(val < min)
		val = min
	else if(val > max)
		val = max
	return val
}

/* iframe 주소 바꾸기. src를 직접 바꾸면 브라우저 기록이 한 칸씩 쌓여
   뒤로가기가 페이지 대신 iframe 안의 이전 주소로 가 버리므로, 같은 속성의 새 iframe으로 갈아 끼운다.
   src가 비면 빈 iframe(about:blank)이 된다. id가 같아서 전역 이름(예: lol_rpanel_body_youtube_player)은 새 iframe을 가리킨다 */
function iframe_set_src(iframe, src)
{
	if((iframe.getAttribute('src') || '') == src)
		return iframe

	var new_iframe = iframe.cloneNode(false)
	if(src)
		new_iframe.setAttribute('src', src)
	else
		new_iframe.removeAttribute('src')
	iframe.replaceWith(new_iframe)
	return new_iframe
}

function random_hash()
{
	return Math.random().toString(36).substr(2,11) + Math.random().toString(36).substr(2,11)
}

var dateReg = /(?<year>\d*)-(?<month>\d*)-(?<day>\d*).(?<hour>\d*):(?<minute>\d*):(?<second>\d*)/
function GetDate() // YYYYMMDD HHMMSS
{
	var cur_date = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString() // 2021-07-18T00:19:30.530Z
	var reg_ret = dateReg.exec(cur_date)
	return format('{0}{1}{2} {3}{4}{5}', reg_ret.groups['year'], reg_ret.groups['month'], reg_ret.groups['day'], reg_ret.groups['hour'], reg_ret.groups['minute'], reg_ret.groups['second'] )
}

function lol_get_icon_url(icon_img, badge_use = 0)
{
	if(icon_img && /^https?:\/\//i.test(icon_img))
		return icon_img
	if(icon_img && icon_img.length)
		return format('http://lolwiki.kr/freeboard/uploads/icon_img/files/{0}/{1}', lol_get_date_from_filename(icon_img), icon_img)
	return format('http://lol100.co.kr/badge/{0}.jpg', badge_use)
}

/* 'img_-2419110_20210708232707.jpg' -> '2021_07_08' */
function lol_get_date_from_filename(filename)
{
	var reg = /.*_(\d{4})(\d{2})(\d{2})/
	if(!reg.test(filename))
	{
		console.log('파일명에서 날짜를 찾지 못함.', filename)
		return ''
	}
	var ret = reg.exec(filename)
	return format('{0}_{1}_{2}', ret[1], ret[2], ret[3])
}

function dec2hex (dec) 
{
	return dec.toString(16).padStart(2, "0")
}
  
  // generateId :: Integer -> String
function generate_id (len) 
{
	var arr = new Uint8Array((len || 40) / 2)
	window.crypto.getRandomValues(arr)
	return Array.from(arr, dec2hex).join('')
}

