var g_last_chat = ''
var mute_list = []
var tts_mute_list = []
var ping_time = 0

var cached_chat_call_audio = null

/* 채팅창에 메시지 추가 함수 */
var imgReg = /\/(img|ㅑㅡㅎ)\s+(\S+)/i
var videoReg = /\/(video|퍙대)\s+(\S+)/i
var byteReg = /[\da-zA-Z-_=\|\/\*-\+\.`~'\/,\!@#\$%\^\&\(\)\[\] "]/i
var callReg = /@(\S+)/g
var callRegPre = /@(\S+)/
var emojiReg = /\p{Extended_Pictographic}/u
// [v2] 새 채팅 디자인 사용 여부 (<html chat-modern>). 속성을 빼면 예전 채팅으로 돌아간다.
var g_chat_modern = document.documentElement.hasAttribute('chat-modern')
function add_message(data) 
{
	if(g_nick == 'OBS' && data.type != 'message')
		return

	if(data.name && mute_list.indexOf(data.name) >= 0)
	{
		console.log(format('[{0}] {1} : {2}', data.time, data.name, data.message))
		return
	}

	// [v2] 새 채팅 디자인: 내가 보낸 메시지는 먼저 화면에 그려 두었으므로(send) 서버 확인만 반영한다
	if(g_chat_modern && data.client_id && data.name == g_nick)
	{
		var pending = chat.querySelector('[client_id="' + data.client_id + '"]')
		if(pending)
		{
			pending.removeAttribute('pending')
			var pending_time = pending.querySelector('.chat_time')
			if(pending_time && data.time)
				pending_time.textContent = data.time
			return pending
		}
	}

	var need_scroll = is_scroll_bottom() || g_nick == 'OBS'

	var message = document.createElement('div')
	if(g_chat_modern && data.client_id)
		message.setAttribute('client_id', data.client_id)
	if(g_chat_modern && data.pending)
		message.toggleAttribute('pending', true)
	
	var text = ''
	var nick = ''
	var className = ''

	var emoji_mode = (data.message.length == 2 && emojiReg.test(data.message))

	// 타입에 따라 적용할 클래스를 다르게 지정
	switch (data.type) 
	{
		case 'message':
			message.classList.add('chat_balloon')

			// 예전 디자인은 이름·시간 사이를 공백 글자로 띄웠다. 새 디자인은 CSS 간격만 쓴다
			nick = g_chat_modern ? data.name : data.name + '  '

			if(emoji_mode)
				text = data.message
			else
				text = '\n' + data.message

			// TTS 아이콘
			if(data.tts_hash)
			{
				var tts_icon = document.createElement('img')
				if(toonat_voices.indexOf(data.tts_hash) >= 0)
				{
					if( ['maoruya'].indexOf(data.tts_hash) >= 0)
						tts_icon.src = format('static/{0}.gif', data.tts_hash)
					else
						tts_icon.src = format('static/{0}.png', data.tts_hash)
					tts_icon.classList.add('big_tts_icon')
				}
				else
				{
					tts_icon.src = 'static/tts.png'
					tts_icon.onclick = play_tts_audio_this
				}
				tts_icon.classList.add('chat_tts_icon')
				tts_icon.setAttribute('tts_hash', data.tts_hash)
				message.appendChild(tts_icon)
			}

			var nick_img = document.createElement('img')
			nick_img.classList.add('chat_profile')
			nick_img.src = format('icon/{0}.png?ver={1}', data.icon_id, data.icon_ver)
			nick_img.onmouseenter = image_onmouseenter
			nick_img.onmouseout = image_onmouseout
			nick_img.onmousemove = image_onmousemove
			message.appendChild(nick_img)

			var nick_font = document.createElement('font')
			nick_font.appendChild(document.createTextNode(nick))
			if(g_nick == 'OBS')
			{
				nick_font.style.fontSize = '18px'
				message.style.fontSize = '18px'
			}
			nick_font.classList.add('nick')
			nick_font.classList.add('nanum')
			if(byteReg.test(data.name[0]))
				nick_font.style.paddingLeft = '2px'
			nick_font.toggleAttribute('emoji', emoji_mode)
			message.appendChild(nick_font)
			
			// 시간 넣기
			var timeFont = document.createElement('font')
			timeFont.classList.add('chat_time')
			timeFont.appendChild(document.createTextNode(g_chat_modern ? data.time : '  ' + data.time))
			message.appendChild(timeFont)
			
			if(data.name == g_nick)
				className = 'me'
			else
				className = 'other'

			// [v2] 같은 사람이 연달아 보낸 메시지는 묶어서 보여 준다 (이미지·TTS 메시지는 따로)
			message.setAttribute('chat_name', data.name)
			if(g_chat_modern && !emoji_mode && !data.tts_hash && !imgReg.test(text) && !videoReg.test(text))
			{
				var prev = chat.lastElementChild
				if(prev && prev.classList.contains('chat_balloon') && prev.getAttribute('chat_name') == data.name && !prev.querySelector('.chat_img') && !prev.querySelector('temp[emoji]'))
					message.toggleAttribute('continued', true)
			}
		break

		case 'connect':
		case 'disconnect':
		case 'system_message':
			className = data.type
			text = data.message
			if(typeof text === 'object')
				text = JSON.stringify(text)
		break
	}

	if(imgReg.test(text))
	{
		var img_url = imgReg.exec(text)[2]
		text = text.replace(imgReg, '')

		if(!option_checkbox_dezeolmo.checked)
		{
			var lol_link_img = document.createElement('img')
			lol_link_img.classList.add('chat_img')
			lol_link_img.src = lol_convert_uri_to_mirror(img_url)
			lol_link_img.onmouseenter = image_onmouseenter
			lol_link_img.onmouseout = image_onmouseout
			lol_link_img.onmousemove = image_onmousemove
			lol_link_img.onerror = function() { lol_link_img.style.height = '0px'; }
			if(need_scroll)
				lol_link_img.onload = scrollDown
			message.appendChild(lol_link_img)
		}
	}

	if(videoReg.test(text))
	{
		var video_url = videoReg.exec(text)[2]
		var video = document.createElement('video')
		video.classList.add('chat_img')
		video.src = video_url
		video.autoplay = 'autoplay'
		video.loop = 'loop' 
		video.controls = 'controls' 
		video.muted = 'muted' 
		video.onerror = function() { video.style.height = '0px'; }
		if(need_scroll)
			video.onloadeddata = scrollDown
		text = text.replace(videoReg, '')
		message.appendChild(video)
	}

	message.classList.add(className)
	message.classList.add('chat')
	if(data.message.length > 0)
	{
		if(data.is_blob)
		{
			var temporary_element = document.createElement('div')
			temporary_element.appendChild(document.createTextNode(text.substring(1)))
			temporary_element.style.fontSize = 'small'
			temporary_element.style.textAlign = 'right'
			message.appendChild(temporary_element)
		}
		else
		{
			var temporary_element = document.createElement('temp')
			// [v2] 새 디자인은 이름 줄과 본문이 분리된 레이아웃이라 본문 앞 줄바꿈이 필요 없다
			if(g_chat_modern && data.type == 'message')
				text = text.replace(/^\n/, '')
			chat_append_linked_text(temporary_element, text)
			temporary_element.toggleAttribute('emoji', emoji_mode)
			message.appendChild(temporary_element)
		}
	}
	// message.appendChild(document.createTextNode(text))
	chat.appendChild(message)

	if(data.lol_link_data)
	{
		var icon_img = data.lol_link_data.icon_img
		var post_title = data.lol_link_data.post_title
		var post_reply = data.lol_link_data.post_reply
		var post_spec = data.lol_link_data.post_spec
		var post_seq = data.lol_link_data.post_seq

		var lol_link_div = document.createElement('div')
		lol_link_div.classList.add('lol_article_list_item')
		lol_link_div.classList.add('chat_lol_link')
		lol_link_div.setAttribute('seq', post_seq)
		lol_link_div.onclick = lol_onclick_article
		
		// 아이콘
		var lol_link_img = document.createElement('img')
		lol_link_img.toggleAttribute('icon', true)
		lol_link_img.src = lol_convert_uri_to_mirror(icon_img)
		lol_link_div.appendChild(lol_link_img)

		var center_div = document.createElement('div')
		center_div.toggleAttribute('article_info')

		// 제목
		var title_container = document.createElement('div')
		title_container.toggleAttribute('title_container', true)

		var title = document.createElement('div')
		title.toggleAttribute('title', true)
		// title.appendChild(document.createTextNode(e['post_title']))
		title.innerHTML = post_title
		title_container.appendChild(title)

		if(post_reply > 0)
		{
			var reply_cnt = document.createElement('div')
			reply_cnt.toggleAttribute('reply_cnt', true)
			reply_cnt.textContent = post_reply // 대괄호는 CSS가 붙인다
			title_container.appendChild(reply_cnt)
		}
		center_div.appendChild(title_container)

		// 하단
		var spec = document.createElement('div')
		spec.toggleAttribute('spec', true)
		spec.innerHTML = post_spec
		center_div.appendChild(spec)
		lol_link_div.appendChild(center_div)

		message.appendChild(lol_link_div)
	}
	
	if(data.bg)
		message.style.backgroundColor = data.bg

	if(need_scroll)
		scrollDown()

	// 호출 사운드
	if(option_checkbox_mention.checked) // 호출 알림 체크되어있어야 재생
	{
		if(callRegPre.test(text)) // @가 있는지부터 체크
		{
			callReg.test('') // 초기화
			var t_callRegResult = callReg.exec(text)
			while(t_callRegResult)
			{
				if(t_callRegResult[1] == g_nick || t_callRegResult[1] == 'everyone')
					play_call_audio()

				t_callRegResult = callReg.exec(text)
			}
		}

		if(data.type == 'message' && decodeURIComponent(location.hash.substring(1)).split(',').filter(x => x.length > 0 && text.indexOf(x) != -1).length > 0)
			play_call_audio()
	}

	return message
}

/* 채팅창에 시스템 메시지 추가 함수 */
/* 글자 속 주소(http://, https://, www.)는 새 탭으로 열리는 링크로, 나머지는 글자 그대로 넣는다.
   innerHTML 을 쓰지 않으므로 채팅에 태그를 써도 그대로 글자로 보인다 */
var chat_link_reg = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi

function chat_append_linked_text(el, text)
{
	var last = 0
	var m
	chat_link_reg.lastIndex = 0
	while((m = chat_link_reg.exec(text)))
	{
		var url = m[0]
		// 문장 끝 구두점, 짝 없는 닫는 괄호는 주소에서 뺀다 ("https://a.com/x)." → "https://a.com/x")
		var trimmed = url.replace(/[.,!?;:]+$/, '')
		while(/[)\]}]$/.test(trimmed) && (trimmed.match(/[(\[{]/g) || []).length < (trimmed.match(/[)\]}]/g) || []).length)
			trimmed = trimmed.slice(0, -1).replace(/[.,!?;:]+$/, '')
		if(!trimmed || /^www\.$/i.test(trimmed))
			continue

		if(m.index > last)
			el.appendChild(document.createTextNode(text.substring(last, m.index)))

		var a = document.createElement('a')
		a.href = /^www\./i.test(trimmed) ? 'https://' + trimmed : trimmed
		a.target = '_blank'
		a.rel = 'noopener noreferrer'
		a.toggleAttribute('chat_link', true)
		a.textContent = trimmed
		el.appendChild(a)

		last = m.index + trimmed.length
		chat_link_reg.lastIndex = last
	}
	if(last < text.length)
		el.appendChild(document.createTextNode(text.substring(last)))
}

function add_system_message(message, bg = '')
{
	if(g_nick == 'OBS')
		return

	return add_message({type: 'system_message', message: message, bg: bg})
}

/* 현재 플레이영상 전용 메시지 추가 함수 */
function add_play_message(data)
{
	if(g_nick == 'OBS')
		return

	var need_scroll = is_scroll_bottom()

	var base = document.createElement('div')
	base.classList.add('system_message')
	base.classList.add('chat')
	base.classList.add('play_info')

	if(!option_checkbox_dezeolmo.checked)
	{
		var img = document.createElement('img')
		if(need_scroll)
			img.onload = scrollDown
		img.src = data.thumbnail
		img.setAttribute('video_id', data.video_id)
		img.onclick = onclick_play_data
		img.onmouseenter = image_onmouseenter
		img.onmouseout = image_onmouseout
		img.onmousemove = image_onmousemove
		img.setAttribute('ui_tooltip_x_offset', 60)
		register_ui_tooltip_event(img, '영상 주소 복사')
		base.appendChild(img)
	}

	var dj = document.createElement('div')
	dj.classList.add('play_info_dj')
	dj.appendChild(document.createTextNode(format('DJ : {0}', data.dj)))
	base.appendChild(dj)

	var title = document.createElement('div')
	title.classList.add('play_info_title')
	title.appendChild(document.createTextNode(format('제목 : {0} ({1})', data.title, second_to_string(data.duration))))
	base.appendChild(title)

	chat.appendChild(base)

	if(need_scroll)
		scrollDown()

	return base
}

function onclick_play_data()
{
	var thisElement = event.target
	copyToClipboard('https://www.youtube.com/watch?v=' + thisElement.getAttribute('video_id'))
}


/* 메시지 전송 함수 */
var playReg = /^\/(p|ㅔ|play|ㅔㅣ묘)\s+(\S+)/i
var queueReg = /^\/(q|ㅂ|queue|벼뎓)\s+(\S+)/i
var rewindReg = /^\/(r|rewind|ㄱㄷ쟈ㅜㅇ|ㄱ|되감기)\s+(\d+)\s*(\d+)?\s*(\d+)?/i
var forwardReg = /^\/(f|fwd|ㄹㅈㅇ|ㄹ|빨리감기)\s+(\d+)\s*(\d+)?\s*(\d+)?/i
var requestReg = /^\/request\s+(\S+)/i
var selectPlaylistReg = /^\/select_playlist\s+(\d+)/i
var pushReg = /^\/push\s+(\S+)\s+(\d+)/i
var queryReg = /^\/query\s+(.+)/i
var iconReg = /^\/icon\s+(.+)/i
var muteReg = /^\/mute\s+(.+)/i
var ttsMuteReg = /^\/ttsmute\s+(.+)/i
var refreshReg = /^\/refresh\s+(.+)/i
var ttsReg = /\/(tts|ㅅㅅㄴ)\s+(.+)/i
var evalReg = /\/eval\s+(\S+)\s+(.+)/i
var evalAllReg = /\/evalall\s+(.+)/i
var debugReg = /\/debug\s+(.+)/i
var adReg = /^\/(ad|ㅁㅇ)\s+(.+)/i
var volReg = /^\/vol\s+(.+)/i
var sayReg = /^\/say\s+(.+?)\s(.+)/i
var twitchReg = /^\/(?:twitch|xmdnlcl|트위치|ㅌㅇㅊ|ㅅ|t)\s+(.+)/i
function send(force_tts = false) {
	if(!g_isLogin)
		return

	// [v2] 연결이 끊긴 동안 보낸 메시지는 재연결 직후(로그인 전)에 서버로 가서 버려지므로, 입력 내용은 그대로 두고 알린다
	if(!socket.connected || (typeof g_reconnect != 'undefined' && g_reconnect.waiting_login))
	{
		add_system_message('서버와 다시 연결되는 중이라 메시지를 보내지 못했습니다.\n연결되면 다시 보내 주세요.')
		return
	}

	// 입력되어있는 데이터 가져오기
	var message = chat_input.value 
	if(message)
		g_last_chat = message

	if(message && force_tts && !ttsReg.test(message))
		message = '/tts ' + message

	// 가져왔으니 데이터 빈칸으로 변경
	chat_input.value = ''

	// 빈 메시지 무시
	if (!message)
		return

	if(message == '/?' || message == '/help')
	{
		// var help_message = add_system_message('' 
		// 					+ '※ 영상 관련\n'
		// 					+ '/play {유튜브주소} : 영상 예약 (/p)\n'
		// 					+ '/queue {유튜브주소} : 영상 예약 (/q)\n'
		// 					+ '/queue : 현재 영상 대기열 확인 (/q)\n'
		// 					+ '/skip : 현재 영상 스킵 (/s)\n'
		// 					+ '/rewind 10 : 10초 되감기 (/r)\n'
		// 					+ '/rewind 3 15 : 3분 15초 되감기 (/r)\n'
		// 					+ '/rewind 1 3 15 : 1시간 3분 15초 되감기 (/r)\n'
		// 					+ '/fwd 10 : 10초 빨리감기 (/f) (시 분 초 가능)\n'
		// 					+ '/playing : 재생 싱크 맞추기\n'
		// 					+ '\n※ 채팅 관련\n'
		// 					+ '/list : 참가자 목록 보기 (/l)\n'
		// 					+ '/clear : 채팅창 정리\n'
		// 					+ '/짤 {검색어} : 단부루 랜덤 이미지\n'
		// 					+ '/mute {닉네임} : 유저 차단(재접 시 초기화)\n'
		// 					+ '/img  {이미지주소} : 이미지 게시\n'
		// 					+ '또는 채팅창에 이미지 붙여넣기(Ctrl+v)\n'
		// 					+ '@{닉네임} : 유저 호출 (@everyone 가능)\n'
		// 					+ '\n※ 기타\n'
		// 					// + '/아이콘변경법 : 아이콘 변경 안내\n'
		// 					+ '/ping : 서버 핑 확인\n'
		// 					+ '/tts {할말} : TTS 읽기\n'
		// 					+ '/ad {할말} : 영상 위에 띄우기\n'
		// 					+ '/vol {닉네임} : 음량 체크\n'
		// 					+ '\n※ 아이콘 변경\n'
		// 					+ '채팅창에 /icon 이라고 적고 \n아이콘으로 하길 원하는 이미지를 복사해서 \n채팅창에 붙여넣기 하면 아이콘이 등록됩니다.\n또는 /icon {이미지주소} 를 입력하세요.'
		// 					, 'var(--채팅_헬프_배경색)')
		// help_message.style.fontFamily = 'Nanum Gothic'
		// help_message.style.textAlign = 'left'

		window.open('https://github.com/SnowyWalk/LoLWikiDJ/blob/develop/도움말.md', '도움말')
		return
	}

	// play url 테스트
	if(playReg.test(message))
	{
		var url = queueReg.exec(message)[2]
		var video_id = ''
		if(url.indexOf('.m3u8') >= 0 || url.indexOf('.flv') >= 0)
			video_id = url
		else
			video_id = youtube_url_parse(url)

		socket.emit('queue', {dj: g_nick, video_id: video_id})
		return
	}

	if(queueReg.test(message))
	{
		var url = queueReg.exec(message)[2]
		var video_id = ''
		if(url.indexOf('.m3u8') >= 0 || url.indexOf('.flv') >= 0)
			video_id = url
		else
			video_id = youtube_url_parse(url)

		socket.emit('queue', {dj: g_nick, video_id: video_id})
		return
	}

	if(twitchReg.test(message))
	{
		var video_id = twitch_url_parse(twitchReg.exec(message)[1])
		socket.emit('queue', {dj: g_nick, video_id: video_id, is_twitch: true})
		return
	}

	if(message.toLowerCase() == '/q' || message == '/ㅂ')
	{
		socket.emit('queue_list')
		return
	}

	if(rewindReg.test(message))
	{
		var ret = rewindReg.exec(message)
		var sec = 0
		if(ret[4])
			sec = eval(ret[2]) * 3600 + eval(ret[3]) * 60 + eval(ret[4])
		else if(ret[3])
			sec = eval(ret[2]) * 60 + eval(ret[3])
		else if(ret[2])
			sec = eval(ret[2])
		socket.emit('rewind', {nick: g_nick, sec: sec, message: message})
		return
	}

	if(forwardReg.test(message))
	{
		var ret = forwardReg.exec(message)
		var sec = 0
		if(ret[4])
			sec = eval(ret[2]) * 3600 + eval(ret[3]) * 60 + eval(ret[4])
		else if(ret[3])
			sec = eval(ret[2]) * 60 + eval(ret[3])
		else if(ret[2])
			sec = eval(ret[2])
		socket.emit('forward', {nick: g_nick, sec: sec, message: message})
		return
	}

	if(message.toLowerCase() == '/playing' || message == '/ㅔㅣ묘ㅑㅜㅎ')
	{
		socket.emit('playing')
		return
	}

	if(message.toLowerCase() == '/playlist')
	{
		socket.emit('playlist')
	}

	if(selectPlaylistReg.test(message))
	{
		var id = selectPlaylistReg.exec(message)[1]
		socket.emit('select_playlist', id)
	}

	if(message.toLowerCase() == '/list' || message == '/ㅣㅑㄴㅅ' || message.toLowerCase() == '/l')
	{
		socket.emit('users')
		set_chat_category(mainchat_header_djlist)
		return
	}

	if(message.toLowerCase() == '/dj' || message == '/어')
	{
		socket.emit('djs')
		return
	}

	if(message.toLowerCase() == '/skip' || message == '/나ㅑㅔ' || message.toLowerCase() == '/s' || message == '/ㄴ')
	{
		socket.emit('skip', message)
		return
	}

	if(pushReg.test(message))
	{
		var url = pushReg.exec(message)[1]
		var video_id = youtube_url_parse(url)
		var playlist_id = pushReg.exec(message)[2]
		socket.emit('push_video', {video_id:video_id, playlist_id: playlist_id})
	}

	if(requestReg.test(message))
	{
		var url = requestReg.exec(message)[1]
		var video_id = youtube_url_parse(url)

		socket.emit('request_video_info', video_id)
	}

	if(muteReg.test(message))
	{
		var nick = muteReg.exec(message)[1]
		if(nick == '설보')
		{
			add_system_message('어허~\n그러면 안댕~\n설보를 뮤트하면 죽여버릴지도 모르샤~ /img static/good.png')
			return
		}
		mute_list.push(nick)
		add_system_message(format('\'{0}\' 님을 차단했습니다.\n\n-차단 목록-\n{1}', nick, mute_list.join('\n')))
		return
	}

	if(ttsMuteReg.test(message))
	{
		var nick = ttsMuteReg.exec(message)[1]
		if(nick == '설보')
		{
			add_system_message('어허~\n그러면 안댕~\n설보를 TTS뮤트하면 죽여버릴지도 모르샤~ /img static/good.png')
			return
		}
		tts_mute_list.push(nick)
		add_system_message(format('\'{0}\' 님의 TTS를 차단했습니다.\n\n-TTS차단 목록-\n{1}', nick, tts_mute_list.join('\n')))
		return
	}

	if(refreshReg.test(message))
	{
		var nick = refreshReg.exec(message)[1]
		socket.emit('refresh', nick)
		return
	}

	if(evalReg.test(message))
	{
		var nick = evalReg.exec(message)[1]
		var code = evalReg.exec(message)[2]
		socket.emit('eval', {nick: nick, code: code})
		return
	}

	if(evalAllReg.test(message))
	{
		var code = evalAllReg.exec(message)[1]
		socket.emit('evalall', code)
		return
	}

	if(debugReg.test(message))
	{
		var code = debugReg.exec(message)[1]
		socket.emit('debug', code)
		return
	}

	if(message == '/volcheck')
	{
		socket.emit('evalall', "socket.emit('chat_message', {type: 'message', message:format('음량: {0}% {1}', player.getVolume(), player.isMuted() ? '(음소거)' : ''), tts_hash:''})")
		return
	}

	if(message == '/ping' || message == '/PING')
	{
		ping_time = Date.now()
		socket.emit('ping')
		return
	}

	if(message == '/clear' || message == '/CLEAR' || message == '/클리어' || message == '/c' || message == '/C' || message == '/ㅊ')
	{
		while(chat.hasChildNodes())
			chat.removeChild(chat.lastChild)
		return
	}

	if(message == '/맥심')
	{
		socket.emit('maxim')
	}

	if(message == '/begin')
	{
		socket.emit('test_begin')
	}

	if(message == '/commit')
	{
		socket.emit('test_commit')
	}

	// if(message == '/아이콘변경법')
	// {
	// 	add_system_message('==아이콘 변경법==\n채팅창에 /icon 이라고 적고 \n아이콘으로 하길 원하는 이미지를 복사해서 \n채팅창에 붙여넣기 하면 아이콘이 등록됩니다.\n\n또는 /icon {이미지주소} 를 입력하세요.')
	// 	return
	// }

	if(iconReg.test(message))
	{
		socket.emit('icon_register', iconReg.exec(message)[1])
		return
	}

	if(queryReg.test(message))
	{
		socket.emit('query', queryReg.exec(message)[1])
	}

	var tts_hash = ''
	if(ttsReg.test(message)) 
	{
		message = ttsReg.exec(message)[2]
		var now = new Date()
		if(now - g_last_tts >= 1000) // 1s cooldown
		{
			tts_hash = GetDate() + ' ' + random_hash()
			var voice_name = document.querySelector('[name=tts_voice_name]:checked').value
			if(toonat_voices.indexOf(voice_name) >= 0)
				tts_hash = voice_name
			socket.emit('tts', { text: message, tts_hash: tts_hash, voice_name: voice_name })
			g_last_tts = now
		}
	}

	if(adReg.test(message))
	{
		socket.emit('ad', adReg.exec(message)[2])
		return
	}

	if(volReg.test(message))
	{
		socket.emit('volcheck', {target_nick: volReg.exec(message)[1], message: message})
		return
	}

	if(message == '/snow')
	{
		if(g_snow_interval_id == 0)
		{
			g_snow_interval_id = setInterval(createSnow, 100)
		}
		else
		{
			clearInterval(g_snow_interval_id)
			g_snow_interval_id = 0
		}
		return
	}

	if(message == '/chat' || message == '/챗' || message == '/CHAT' || message == '/촘ㅅ' || message == '/촘ㅆ' || message == '/cot' || message == '/COT')
	{
		g_is_chat_mode = !g_is_chat_mode
		mainchat.toggleAttribute('chat_mode', g_is_chat_mode) // 폭은 CSS #mainchat[chat_mode]
		resize()
		return
	}

	if(sayReg.test(message))
	{
		var nick = sayReg.exec(message)[1]
		var code = format("socket.emit('chat_message', { type: 'message', message: '{0}' })", sayReg.exec(message)[2])
		socket.emit('eval', {nick: nick, code: code})
		return
	}


	// 서버로 message 이벤트 전달 + 데이터와 함께
	// [v2] 새 채팅 디자인: 서버 왕복을 기다리지 않고 내 메시지를 바로 그린다 (서버 확인이 오면 흐림이 풀림)
	var client_id = ''
	var me = g_chat_modern && g_nick != 'OBS' && typeof g_users != 'undefined' && g_users ? g_users.find(function(u) { return u.nick == g_nick }) : null
	if(me)
	{
		client_id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
		var local_time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })
		add_message({ type: 'message', message: message, tts_hash: tts_hash, name: g_nick, time: local_time, icon_id: me.icon_id, icon_ver: me.icon_ver, client_id: client_id, pending: true })
	}
	socket.emit('chat_message', { type: 'message', message: message, tts_hash: tts_hash, client_id: client_id })
	scrollDown()
}


/* 채팅창 엔터 단축키 */
function chat_keydown() {
	// 호출 목록이 떠 있으면 위·아래·Enter·Tab·Esc 는 목록이 먼저 쓴다
	if(chat_mention_keydown(window.event))
		return

	if (window.event.keyCode == 13)
	{
		send(window.event.shiftKey && option_checkbox_tts_key_bind.checked)
	}
	else if(window.event.keyCode == 38 && g_last_chat)
	{
		chat_input.value = g_last_chat
		setTimeout(_ => {
			chat_input.setSelectionRange(chat_input.value.length, chat_input.value.length)
		}, 10);
	}
}

/* [v2] '@' 호출 목록
   입력창에서 커서 앞 단어가 '@...' 이면 접속자 중 그 글자로 시작하거나 포함하는 닉네임을 띄운다.
   클릭하거나 위·아래 + Enter/Tab 으로 고르면 '@닉네임 ' (공백까지) 으로 바꿔 넣는다. Esc 로 닫기 */
const CHAT_MENTION_MAX = 8
var g_chat_mention = null // { start: '@' 위치, items: [닉네임], index: 고른 줄 }

function chat_mention_box()
{
	var box = document.getElementById('chat_mention')
	if(!box)
	{
		box = document.createElement('ul')
		box.id = 'chat_mention'
		// 누르는 순간 입력창 포커스를 빼앗지 않게 (blur 로 목록이 먼저 닫히지 않도록)
		box.addEventListener('mousedown', function(event) { event.preventDefault() })
		chat_input.parentElement.appendChild(box)
	}
	return box
}

function chat_mention_close()
{
	g_chat_mention = null
	var box = document.getElementById('chat_mention')
	if(box)
		box.style.display = 'none'
}

function chat_mention_update()
{
	var caret = chat_input.selectionStart
	var m = caret == chat_input.selectionEnd ? /(^|\s)@(\S*)$/.exec(chat_input.value.substring(0, caret)) : null
	if(!m || g_nick == 'OBS')
	{
		chat_mention_close()
		return
	}

	var query = m[2].toLowerCase()
	var nicks = (g_users || []).map(function(u) { return u.nick }).filter(function(nick) { return nick && nick != g_nick })
	var starts = nicks.filter(function(nick) { return nick.toLowerCase().startsWith(query) })
	var contains = nicks.filter(function(nick) { return !nick.toLowerCase().startsWith(query) && nick.toLowerCase().indexOf(query) >= 0 })
	var collator = new Intl.Collator('ko')
	var items = starts.sort(collator.compare).concat(contains.sort(collator.compare)).slice(0, CHAT_MENTION_MAX)
	if('everyone'.startsWith(query))
		items.push('everyone') // 모두 호출 (index_chat.js 의 호출 알림이 'everyone' 을 받는다)
	if(!items.length)
	{
		chat_mention_close()
		return
	}

	var prev = g_chat_mention && g_chat_mention.items[g_chat_mention.index]
	var index = Math.max(0, items.indexOf(prev))
	g_chat_mention = { start: caret - m[2].length - 1, items: items, index: index }

	var box = chat_mention_box()
	box.replaceChildren()
	items.forEach(function(nick, i) {
		var li = document.createElement('li')
		li.toggleAttribute('selected', i == index)
		var user = (g_users || []).find(function(u) { return u.nick == nick })
		var icon = document.createElement(user ? 'img' : 'span')
		icon.setAttribute('icon', '')
		if(user)
			icon.src = format('icon/{0}.png?ver={1}', user.icon_id, user.icon_ver)
		li.appendChild(icon)
		var label = document.createElement('span')
		label.textContent = user ? nick : '@everyone (모두 호출)'
		li.appendChild(label)
		li.addEventListener('click', function() { chat_mention_pick(i) })
		box.appendChild(li)
	})
	box.style.display = 'block'
}

function chat_mention_select(index)
{
	var box = document.getElementById('chat_mention')
	g_chat_mention.index = (index + g_chat_mention.items.length) % g_chat_mention.items.length
	Array.prototype.forEach.call(box.children, function(li, i) { li.toggleAttribute('selected', i == g_chat_mention.index) })
	box.children[g_chat_mention.index].scrollIntoView({ block: 'nearest' })
}

function chat_mention_pick(index)
{
	var mention = g_chat_mention
	if(!mention)
		return
	var value = chat_input.value
	var caret = chat_input.selectionStart
	var insert = '@' + mention.items[index] + ' '
	chat_input.value = value.substring(0, mention.start) + insert + value.substring(caret).replace(/^ /, '')
	var pos = mention.start + insert.length
	chat_input.setSelectionRange(pos, pos)
	chat_input.focus()
	chat_mention_close()
}

/* 처리했으면 true (chat_keydown 이 그 키를 더 쓰지 않는다) */
function chat_mention_keydown(event)
{
	if(!g_chat_mention)
		return false
	switch(event.key)
	{
		case 'ArrowDown': chat_mention_select(g_chat_mention.index + 1); break
		case 'ArrowUp': chat_mention_select(g_chat_mention.index - 1); break
		case 'Enter':
		case 'Tab':
			if(event.isComposing) // 한글 조합 중 Enter 는 조합 확정
				return true
			chat_mention_pick(g_chat_mention.index)
			break
		case 'Escape': chat_mention_close(); break
		default: return false
	}
	event.preventDefault()
	return true
}

chat_input.addEventListener('input', chat_mention_update)
chat_input.addEventListener('click', chat_mention_update)
chat_input.addEventListener('keyup', function(event) { // 좌우로 커서만 옮겨도 다시 판단
	if(['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) >= 0)
		chat_mention_update()
})
chat_input.addEventListener('blur', chat_mention_close)

/* [v2] 채팅 이미지 올리기 (붙여넣기·끌어다 놓기 공통)
   클립보드 이미지는 압축이 약한 PNG 원본이라 스크린샷·사진이면 몇 MB씩 된다. 그래서
   - 긴 변이 CHAT_IMAGE_MAX_SIDE 를 넘으면 줄이고, WebP 로 다시 인코딩해 원본보다 작을 때만 그걸 쓴다
   - base64 글자(용량 +33%) 대신 바이너리로 보낸다
   움짤(GIF)은 움직임이 사라지므로 그대로 보낸다 */
const CHAT_IMAGE_MAX_SIDE = 2560
const CHAT_IMAGE_QUALITY = 0.92
const CHAT_IMAGE_SEND_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/gif'] // 서버가 받는 형식

async function chat_compress_image(file)
{
	if(file.type == 'image/gif')
		return file

	try
	{
		var bitmap = await createImageBitmap(file)
		var scale = Math.min(1, CHAT_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
		var canvas = document.createElement('canvas')
		canvas.width = Math.max(1, Math.round(bitmap.width * scale))
		canvas.height = Math.max(1, Math.round(bitmap.height * scale))
		canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
		bitmap.close()

		// WebP 인코딩을 못 하는 브라우저는 PNG 를 돌려준다 → 그때도 원본보다 작거나 줄였으면 쓴다
		var blob = await new Promise(function(resolve) { canvas.toBlob(resolve, 'image/webp', CHAT_IMAGE_QUALITY) })
		if(blob && (blob.size < file.size || scale < 1 || CHAT_IMAGE_SEND_TYPES.indexOf(file.type) < 0))
		{
			console.log(format('채팅 이미지 {0} → {1} ({2}, {3}×{4})', fileSizeLabel(file.size), fileSizeLabel(blob.size), blob.type, canvas.width, canvas.height))
			return blob
		}
	}
	catch(e)
	{
		console.warn('채팅 이미지 압축 실패, 원본을 보냅니다', e)
	}
	return file
}

async function chat_send_image(file)
{
	var blob = await chat_compress_image(file)
	if(CHAT_IMAGE_SEND_TYPES.indexOf(blob.type) < 0)
	{
		alert('보낼 수 없는 이미지 형식입니다.')
		return
	}
	socket.emit('image_blob', { type: blob.type, data: await blob.arrayBuffer() })
	scrollDown()
}

function fileSizeLabel(bytes)
{
	return bytes < 1024 * 1024 ? (Math.round(bytes / 1024 * 10) / 10) + ' KB' : (Math.round(bytes / 1024 / 1024 * 100) / 100) + ' MB'
}

/* 채팅창 이미지 붙여넣기 이벤트 */
function chat_onpaste() {
	var message = chat_input.value
	var __is_icon = message.startsWith('/icon')
	pasteObj = (event.clipboardData || window.clipboardData); 
	var blob = pasteObj.files[0]
	if(!blob)
		return
	if(!__is_icon)
	{
		chat_send_image(blob)
		return
	}

	// 아이콘 등록(/icon)은 서버가 받은 PNG 를 그대로 아이콘 파일(.png)로 저장하므로 예전처럼 원본을 보낸다
	chat_input.value = ''
	var reader = new FileReader()
	reader.onload = function(ev) { 
		socket.emit('icon_register', ev.target.result)
		scrollDown()
	}
	reader.readAsDataURL(blob)
}

function ondrop_chat_input_file(e)
{
	e.stopPropagation();
    e.preventDefault();
 
	// console.warn(e.target.files)
	// console.warn(e.dataTransfer)
    // e.dataTransfer = e.originalEvent.dataTransfer;
    var files = e.target.files || e.dataTransfer.files;

	console.log(e, e.dataTransfer, e.dataTransfer.files, e.dataTransfer.files[0], files)

 
    if (files.length > 1) {
        alert('응니얼굴');
        return;
    }

	if (!files[0].type.match(/image.*/)) {
        alert('이미지가 아닙니다.');
		return;
	}
		
	chat_send_image(e.dataTransfer.files[0])
}

/* 이미지 저장소 버튼 클릭 이벤트 */

function chat_scroll() {
	var to = is_scroll_bottom() ? 'none' : 'inline-flex' // [v2] 화살표와 글자를 가운데 정렬 (chat-modern.css)

	if(g_nick == 'OBS')
		to = 'none'

	if(chat_scroller.style.display != to)
		chat_scroller.style.display = to
}


function image_onmouseenter()
{
	image_expander.style.display = 'block'
	image_expander_src.src = event.target.src
	image_expander_set_pos(event.clientX, event.clientY)
}

function image_onmouseout()
{
	image_expander.style.display = 'none'
	image_expander_src.src = ''
}

function image_onmousemove()
{
	image_expander_set_pos(event.clientX, event.clientY)
}

function image_expander_set_pos(x, y)
{
	x -= image_expander.clientWidth + 10 // border 1px라서 최소 3
	y -= image_expander.clientHeight + 10 // border 1px라서 최소 3
	if(x < 0)
		x = 0
	if(y < 0)
		y = 0

	image_expander.style.left = x + 'px'
	image_expander.style.top = y + 'px'
}

function play_call_audio(start_time = 0.0)
{
	if(!cached_chat_call_audio)
	{
		cached_chat_call_audio = audio_chat_call
	}
	
	cached_chat_call_audio.volume = option_slider_mention_volume.value
	cached_chat_call_audio.pause()
	cached_chat_call_audio.currentTime = start_time
	cached_chat_call_audio.play()
}

function play_tts_audio_this()
{
	var tts_hash = this.getAttribute('tts_hash')
	if(!tts_hash)
		return

	var new_tts = new Audio('./tts/' + tts_hash)
	new_tts.volume = option_slider_tts_volume.value
	new_tts.onended = destroy_self
	new_tts.play()
}
// [v2] 새 채팅 디자인: 부드럽게 내려가는 중에 사용자가 직접 스크롤하면 바로 멈춘다
if(g_chat_modern)
{
	chat.addEventListener('wheel', function() { stop_chat_scroll_animation() }, { passive: true })
	chat.addEventListener('touchstart', function() { stop_chat_scroll_animation() }, { passive: true })
}
