/* ====================================== 롤백 ============================================= */

var g_lol_icon_change_start_x = 0
var g_lol_icon_change_start_y = 0
var g_lol_icon_change_size = 0
var g_lol_icon_change_image_data = '' // 아이콘변경 이미지 데이터
var g_lol_icon_change_canvas_context = null
var g_lol_icon_change_image_width = 0 // 실제 이미지의 크기임
var g_lol_icon_change_image_height = 0 // 실제 이미지의 크기임
var g_lol_icon_change_reply_icon_element = null // 아이콘 변경 시 댓글이미지 캐싱
var g_lol_icon_change_drag_start_mx = 0 // 드래그 이벤트를 위해
var g_lol_icon_change_drag_start_my = 0 // 드래그 이벤트를 위해
var g_lol_icon_change_drag_start_x = 0 // 드래그 시작했을때 크롭영역의 위치
var g_lol_icon_change_drag_start_y = 0 // 드래그 시작했을때 크롭영역의 위치
var g_lol_icon_change_has_image = false
var g_storage_lol_api_account_key = 'lolwiki_api_account_id'
var g_storage_lol_api_password_key = 'lolwiki_api_password'
var g_storage_lol_api_access_token_key = 'lolwiki_api_access_token'
var g_storage_lol_api_refresh_token_key = 'lolwiki_api_refresh_token'
var g_storage_lol_api_device_key = 'lolwiki_api_device_id'
var g_storage_lol_api_user_key = 'lolwiki_api_user_key'
var g_lol_api_account_id = lol_api_storage_get(g_storage_lol_api_account_key)
var g_lol_api_password = lol_api_storage_get(g_storage_lol_api_password_key)
var g_lol_api_access_token = lol_api_storage_get(g_storage_lol_api_access_token_key)
var g_lol_api_refresh_token = lol_api_storage_get(g_storage_lol_api_refresh_token_key)
var g_lol_api_device_id = lol_api_storage_get(g_storage_lol_api_device_key)
var g_lol_api_user_key = lol_api_storage_get(g_storage_lol_api_user_key)
var g_lol_api_login_pending = false
var g_lol_api_login_callbacks = []
var g_lol_api_restore_socket_id = ''

function lol_api_storage_get(key)
{
	try
	{
		return localStorage.getItem(key) || ''
	}
	catch(error)
	{
		return ''
	}
}

function lol_api_storage_set(key, value)
{
	try
	{
		localStorage.setItem(key, value)
	}
	catch(error) {}
}

function lol_api_storage_remove(key)
{
	try
	{
		localStorage.removeItem(key)
	}
	catch(error) {}
}

function lol_create_api_device_id()
{
	if(g_lol_api_device_id)
		return g_lol_api_device_id

	if(window.crypto && typeof window.crypto.randomUUID == 'function')
		g_lol_api_device_id = window.crypto.randomUUID()
	else
		g_lol_api_device_id = 'lolwikidj-' + Date.now() + '-' + Math.random().toString(16).slice(2)

	lol_api_storage_set(g_storage_lol_api_device_key, g_lol_api_device_id)
	return g_lol_api_device_id
}

function lol_get_api_auth()
{
	return {
		account_id: g_lol_api_account_id,
		password: g_lol_api_password,
		access_token: g_lol_api_access_token,
		refresh_token: g_lol_api_refresh_token,
		device_id: lol_create_api_device_id(),
		user_key: g_lol_api_user_key
	}
}

function lol_add_api_auth(data)
{
	data = data || {}
	data.auth = lol_get_api_auth()
	return data
}

function lol_store_api_credentials(accountId, password)
{
	g_lol_api_account_id = accountId
	g_lol_api_password = password
	lol_api_storage_set(g_storage_lol_api_account_key, accountId)
	lol_api_storage_set(g_storage_lol_api_password_key, password)
}

function lol_store_api_tokens(auth)
{
	if(!auth)
		return

	if(auth.access_token !== undefined)
		g_lol_api_access_token = auth.access_token || ''
	if(auth.refresh_token !== undefined)
		g_lol_api_refresh_token = auth.refresh_token || ''
	if(auth.device_id)
		g_lol_api_device_id = auth.device_id
	if(auth.user_key)
		g_lol_api_user_key = auth.user_key

	if(g_lol_api_access_token)
		lol_api_storage_set(g_storage_lol_api_access_token_key, g_lol_api_access_token)
	else
		lol_api_storage_remove(g_storage_lol_api_access_token_key)
	if(g_lol_api_refresh_token)
		lol_api_storage_set(g_storage_lol_api_refresh_token_key, g_lol_api_refresh_token)
	else
		lol_api_storage_remove(g_storage_lol_api_refresh_token_key)
	if(g_lol_api_device_id)
		lol_api_storage_set(g_storage_lol_api_device_key, g_lol_api_device_id)
	if(g_lol_api_user_key)
		lol_api_storage_set(g_storage_lol_api_user_key, g_lol_api_user_key)
}

function lol_invalidate_api_session()
{
	g_lol_api_access_token = ''
	g_lol_api_refresh_token = ''
	lol_api_storage_remove(g_storage_lol_api_access_token_key)
	lol_api_storage_remove(g_storage_lol_api_refresh_token_key)
}

function lol_complete_api_login(result)
{
	if(!result || !result.user)
		return

	lol_store_api_tokens(result.auth)
	g_lol_user_info = result.user
	g_lol_api_user_key = result.user.local_user_key || result.user.user_key || String(result.user.id || '')
	g_lol_android_id = g_lol_api_user_key || g_lol_guest_id
	if(g_lol_api_user_key)
		lol_api_storage_set(g_storage_lol_api_user_key, g_lol_api_user_key)

	lol_lpanel_write_button.style.display = 'block'
	lol_lpanel_update()
	lol_rpanel_update()
	lol_notif_poll_start() // [v2] 알림센터 배지 (안 읽은 알림·쪽지)

	var callbacks = g_lol_api_login_callbacks.splice(0)
	for(var callback of callbacks)
		callback()
}

function lol_login_api_account(callback)
{
	if(callback)
		g_lol_api_login_callbacks.push(callback)

	lol_request_api_credentials(function() {
		if(g_lol_api_login_pending)
			return

		g_lol_api_login_pending = true
		socket.emit('lol_api_login', { auth: lol_get_api_auth() })
	})
}

function lol_restore_api_session()
{
	if(!g_lol_api_account_id && !g_lol_api_access_token && !g_lol_api_refresh_token)
		return
	if(typeof socket == 'undefined' || !socket.connected)
		return
	if(g_lol_api_restore_socket_id == socket.id)
		return

	g_lol_api_restore_socket_id = socket.id
	socket.emit('lol_api_restore', { auth: lol_get_api_auth() })
}

function lol_request_api_credentials(callback)
{
	if(g_lol_api_account_id && g_lol_api_password)
	{
		callback(lol_get_api_auth())
		return
	}

	var existing = document.getElementById('lol_api_login_overlay')
	if(existing)
	{
		existing.querySelector('input').focus()
		return
	}

	var overlay = document.createElement('div')
	overlay.id = 'lol_api_login_overlay'
	overlay.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:100000;background:rgba(0,0,0,.68);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;'

	var form = document.createElement('form')
	form.style.cssText = 'width:360px;max-width:100%;padding:22px;border-radius:8px;background:#252525;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:14px;box-sizing:border-box;'

	var title = document.createElement('div')
	title.textContent = '롤백과사전 로그인'
	title.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:10px;'
	form.appendChild(title)

	var guide = document.createElement('div')
	guide.textContent = '커뮤니티 기능을 이용하려면 롤백과사전 아이디와 비밀번호로 로그인해주세요. 로그인 정보와 인증 토큰은 이 브라우저에 저장됩니다.'
	guide.style.cssText = 'line-height:1.55;margin-bottom:14px;color:#ddd;'
	form.appendChild(guide)

	var accountInput = document.createElement('input')
	accountInput.type = 'text'
	accountInput.autocomplete = 'username'
	accountInput.placeholder = '롤백과사전 계정 아이디'
	accountInput.value = g_lol_api_account_id
	accountInput.style.cssText = 'display:block;width:100%;height:38px;margin-bottom:9px;padding:0 10px;border:1px solid #555;border-radius:4px;background:#151515;color:#fff;box-sizing:border-box;'
	form.appendChild(accountInput)

	var passwordInput = document.createElement('input')
	passwordInput.type = 'password'
	passwordInput.autocomplete = 'current-password'
	passwordInput.placeholder = '비밀번호'
	passwordInput.style.cssText = accountInput.style.cssText
	form.appendChild(passwordInput)

	var buttonRow = document.createElement('div')
	buttonRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;'

	var cancelButton = document.createElement('button')
	cancelButton.type = 'button'
	cancelButton.textContent = '취소'
	cancelButton.style.cssText = 'padding:8px 14px;border:0;border-radius:4px;background:#555;color:#fff;cursor:pointer;'
	cancelButton.onclick = function() { document.body.removeChild(overlay) }
	buttonRow.appendChild(cancelButton)

	var loginButton = document.createElement('button')
	loginButton.type = 'submit'
	loginButton.textContent = '확인'
	loginButton.style.cssText = 'padding:8px 14px;border:0;border-radius:4px;background:#4f78d1;color:#fff;cursor:pointer;'
	buttonRow.appendChild(loginButton)
	form.appendChild(buttonRow)
	overlay.appendChild(form)

	form.onsubmit = function(event)
	{
		event.preventDefault()
		var accountId = accountInput.value.trim()
		var password = passwordInput.value
		if(!accountId || !password)
		{
			alert('계정 아이디와 비밀번호를 모두 입력해주세요.')
			return
		}

		lol_store_api_credentials(accountId, password)
		document.body.removeChild(overlay)
		callback(lol_get_api_auth())
	}

	document.body.appendChild(overlay)
	if(accountInput.value)
		passwordInput.focus()
	else
		accountInput.focus()
}

function lol_forget_api_password()
{
	g_lol_api_password = ''
	lol_api_storage_remove(g_storage_lol_api_password_key)
}

function lol_forget_api_credentials()
{
	g_lol_api_account_id = ''
	g_lol_api_password = ''
	g_lol_api_access_token = ''
	g_lol_api_refresh_token = ''
	g_lol_api_user_key = ''
	lol_api_storage_remove(g_storage_lol_api_account_key)
	lol_api_storage_remove(g_storage_lol_api_password_key)
	lol_api_storage_remove(g_storage_lol_api_access_token_key)
	lol_api_storage_remove(g_storage_lol_api_refresh_token_key)
	lol_api_storage_remove(g_storage_lol_api_user_key)
	lol_api_storage_remove('lolwiki_api_session_ready')
}

/* 롤백 패널 열기 */
function onrclick_playlist_info_box() 
{
	event.preventDefault()

	g_lol_panel_show = !g_lol_panel_show
	
	if(g_lol_panel_show)
	{
		// 만약 플레이리스트가 켜져있었다면 끄기
		if(g_show_playlist_control_panel)
			toggle_playlist_control_panel()

		g_lol_article_scroll_seq = 0
		g_lol_article_list = []

		if(g_lol_android_id != g_lol_guest_id)
		{
			if(g_lol_user_memos == null)
				socket.emit('lol_get_user_memos', g_lol_android_id)
			socket.emit('lol_user_info', lol_add_api_auth({ user_id: g_lol_android_id }))
		}

		g_lol_search_body = ''
		g_lol_search_nick = ''
		g_lol_search_vote = false
		g_lol_search_mine = false
		g_lol_is_award = false
		g_lol_spec_android_id = g_lol_android_id
		lol_get_article_list(0, g_lol_search_vote ? 22 : 30, g_lol_search_body, g_lol_search_nick, g_lol_search_vote, g_lol_search_mine)
	}
	else
	{
		lol_lpanel_board.scroll(0, 0)
	}

	lol_panel_update()
}

/* 롤백 글 목록 조회 쿼리 */
function lol_get_article_list(seq = 0, cnt = 30, body = '', nick = '', vote = false, mine = false)
{
	g_lol_is_bookmark = false

	console.log('query', {android_id: g_lol_spec_android_id, viewer_android_id: g_lol_android_id, seq: seq, cnt: cnt, body: body, nick: nick, vote: vote, mine: mine})
	socket.emit('lol_get_article_list', lol_add_api_auth({android_id: g_lol_spec_android_id, viewer_android_id: g_lol_android_id, seq: seq, cnt: cnt, body: body, nick: nick, vote: vote, mine: mine}))
}

/* 글 목록 업뎃 */
function lol_lpanel_update()
{
	lol_lpanel_update_header()
	lol_lpanel_update_list()
}

/* 글목록 헤더(내 아이콘·닉네임)만 업뎃. 유저 정보만 바뀐 경우 목록까지 다시 그리면 깜빡인다 */
function lol_lpanel_update_header()
{
	if(!g_lol_user_info)
	{
		// 유저 아이콘
		lol_lpanel_account_icon.style.display = 'none'
		lol_lpanel_account_icon.src = ''

		// 닉네임
		lol_lpanel_account.innerHTML = '로그인 해주세요.'
		// lol_lpanel_account.firstChild.nodeValue = '로그인 해주세요.'
	}
	else
	{
		// 유저 아이콘
		lol_lpanel_account_icon.src = lol_convert_uri_to_mirror(lol_get_icon_url(g_lol_user_info['iconpic'], g_lol_user_info['badge_use']))
		lol_lpanel_account_icon.style.display = 'block'
		lol_lpanel_account_icon.onmouseenter = image_onmouseenter
		lol_lpanel_account_icon.onmouseout = image_onmouseout
		lol_lpanel_account_icon.onmousemove = image_onmousemove

		// 닉네임
		lol_lpanel_account.innerHTML = format('<b>{0}</b> ({1} 스택)', g_lol_user_info['nickname'], g_lol_user_info['point'])

		// 내정보 버튼
		lol_lpanel_userinfo.style.display = 'block'

		// 계정메뉴 - 외부 서버 로그인 아이디 표시
		lol_lpanel_userinfo_menu_label_account_code.firstChild.nodeValue = g_lol_api_account_id
	}

	lol_lpanel_notif.style.display = g_lol_user_info ? 'block' : 'none' // [v2] 알림센터 종은 로그인했을 때만
}

/* 글목록 다시 그리기 */
function lol_lpanel_update_list()
{
	// 아이콘 <img>는 주소가 같으면 새로 만들지 않고 옮겨 쓴다.
	// 새 <img>는 캐시된 이미지라도 디코딩되는 동안 비어 보여서, 목록을 다시 그릴 때마다 아이콘이 깜빡였다
	var old_icons = {}
	for(var old of lol_lpanel_board_list.querySelectorAll('img[icon]'))
	{
		var key = old.getAttribute('src')
		;(old_icons[key] = old_icons[key] || []).push(old)
	}

	var current_seq = g_lol_current_detail ? String(g_lol_current_detail['post_seq'] || '') : ''
	var fragment = document.createDocumentFragment()
	for(var e of g_lol_article_list)
	{
		var div = document.createElement('div')
		div.classList.add('lol_article_list_item')
		div.setAttribute('seq', e['post_seq'])
		if(current_seq && String(e['post_seq']) == current_seq)
			div.toggleAttribute('selected', true)

		// 아이콘
		var icon_src = lol_convert_uri_to_mirror(lol_get_icon_url(e['icon_img'], e['badge_use']))
		var img = old_icons[icon_src] && old_icons[icon_src].shift()
		if(!img)
		{
			img = document.createElement('img')
			img.toggleAttribute('icon', true)
			img.src = icon_src
		}
		div.appendChild(img)

		var center_div = document.createElement('div')
		center_div.toggleAttribute('article_info')

		// 제목
		var title_container = document.createElement('div')
		title_container.toggleAttribute('title_container', true)

		var title = document.createElement('div')
		title.toggleAttribute('title', true)
		// title.appendChild(document.createTextNode(e['post_title']))
		title.innerHTML = e['post_title']
		title_container.appendChild(title)

		if(e['reply_cnt'] > 0)
		{
			var reply_cnt = document.createElement('div')
			reply_cnt.toggleAttribute('reply_cnt', true)
			reply_cnt.textContent = e['reply_cnt'] // 대괄호는 CSS가 붙인다
			title_container.appendChild(reply_cnt)
		}
		center_div.appendChild(title_container)

		// 하단: 항목마다 span으로 나누고 구분자(|)는 CSS가 붙인다
		var spec = document.createElement('div')
		spec.toggleAttribute('spec', true)
		spec.innerHTML = format('<span></span><span nick>{0}</span><span>조회 {1}</span><span>추천 {2}</span>{3}', e['nickname'], e['views'], e['likes'], e['alarm'] > 0 ? format('<span alarm>신고 {0}</span>', e['alarm']) : '')
		var before = e['before'] || e['post_date'] || ''
		lol_set_time(spec.firstChild, before, before.replace('size=1', ''))
		center_div.appendChild(spec)
		div.appendChild(center_div)

		// 텍스트 / 짤 / 유튭 / 두들러 (그림은 CSS가 kind에 따라 넣는다)
		var type = document.createElement('span')
		type.toggleAttribute('type', true)
		if(e['youtube_url'].length)
			type.setAttribute('kind', 'youtube')
		else if(e['doodlr'] > 0)
			type.setAttribute('kind', 'doodlr')
		else if(e['pic_new'].length || e['pic_multi'].length)
			type.setAttribute('kind', 'image')
		else
			type.setAttribute('kind', 'text')
		div.appendChild(type)

		div.onclick = lol_onclick_article
		if(g_lol_is_bookmark || g_lol_is_award)
			div.oncontextmenu = lol_onrclick_article

		fragment.appendChild(div)
	}
	// 지우고 다시 넣는 사이에 빈 목록이 그려지지 않게 한 번에 바꾼다
	lol_lpanel_board_list.replaceChildren(fragment)
}

/* 지금 열린 글을 목록에서 표시 */
function lol_lpanel_mark_selected(seq)
{
	for(var item of lol_lpanel_board_list.children)
		item.toggleAttribute('selected', seq != null && item.getAttribute('seq') == String(seq))
}

/* 글목록 새로고침 버튼 */
function lol_onclick_aritcle_list_refresh()
{
	if(g_lol_is_award)
		return

	g_lol_article_scroll_seq = 0
	g_lol_article_list = []
	// lol_lpanel_refresh.style.display = 'none'
	lol_lpanel_refresh.style.height = '0px'
	lol_lpanel_board.scroll(0, 0)
	if(g_lol_is_bookmark)
	{
		socket.emit('lol_query_bookmark_list', {android_id: g_lol_android_id, offset: 0, count: 30})
	}
	else
	{
		lol_get_article_list(0, g_lol_search_vote ? 22 : 30, g_lol_search_body, g_lol_search_nick, g_lol_search_vote, g_lol_search_mine)
	}
}

/* 글목록 패널 스크롤 이벤트 */
function lol_lpanel_board_onscroll()
{
	if(g_lol_is_award)
		return

	if(lol_lpanel_board.scrollTop + lol_lpanel_board.clientHeight + 10 >= lol_lpanel_board.scrollHeight) // 1799.63 이런식으로 1800이 채 안되는 경우가 있었음. 10정도 여유 줌.
	{
		var curTime = +new Date()
		if(curTime - g_lol_last_scroll_time >= 100)
		{
			g_lol_last_scroll_time = curTime
			if(g_lol_is_bookmark)
			{
				socket.emit('lol_query_bookmark_list', {android_id: g_lol_android_id, offset: g_lol_article_scroll_seq, count: 30})
			}
			else
			{
				lol_get_article_list(g_lol_article_scroll_seq, g_lol_search_vote ? 22 : 30, g_lol_search_body, g_lol_search_nick, g_lol_search_vote, g_lol_search_mine)
			}
		}
	}
}

/* 글 클릭 -> 해당 글 정보 요청 */
function lol_onclick_article()
{
	var seq = event.currentTarget.getAttribute('seq')
	if(!seq)
	{
		console.log('seq가 없다?!', seq)
		return
	}

	if(!g_lol_panel_show)
		onrclick_playlist_info_box()

	g_lol_rpanel_scroll_top_switch = true
	lol_request_article_detail(seq)
}

/* 글 상세 요청. 서버는 본문(lol_article_detail)과 댓글(lol_article_replies)을 따로, 먼저 온 쪽부터 보낸다.
   다른 글이면 응답을 기다리지 않고 바로 상세 화면으로 넘어가 자리표시(스켈레톤)를 보여 준다.
   같은 글(새로고침)이면 지금 내용을 그대로 두고 응답이 오면 덮어쓴다 */
var g_lol_detail_loading = null // { seq, post, replys, timer }
const LOL_DETAIL_TIMEOUT_MS = 35000 // 서버는 요청마다 15초 제한 + 토큰 갱신 후 재시도

function lol_request_article_detail(seq)
{
	if(g_lol_detail_loading)
		clearTimeout(g_lol_detail_loading.timer)

	lol_lpanel_mark_selected(seq)

	var loading = g_lol_detail_loading = { seq: seq, post: null, replys: null, timer: 0 }
	// 응답이 끝내 안 오면(연결 끊김 등) 자리표시에 갇히지 않게 실패로 처리
	loading.timer = setTimeout(function() {
		if(g_lol_detail_loading == loading && !loading.post)
			lol_on_article_detail({ post_seq: '', requested_seq: seq })
		if(g_lol_detail_loading == loading && !loading.replys)
			lol_on_article_replies({ post_seq: seq, replys: [], failed: true })
	}, LOL_DETAIL_TIMEOUT_MS)

	var is_same = g_lol_current_detail && g_lol_current_detail['post_seq'] == seq
	if(!is_same)
	{
		lol_write_panel_toggle(false)
		lol_rpanel_body_youtube_container.style.display = 'none'
		iframe_set_src(lol_rpanel_body_youtube_player, '') // 숨겨진 채로 이전 글 영상 소리가 계속 나지 않게
		lol_rpanel.toggleAttribute('skeleton', true)
		lol_rpanel_reply_board.toggleAttribute('skeleton', true)
		lol_rpanel_body.scroll(0, 0)
		lol_mobile_show_detail(true)
	}

	socket.emit('lol_get_article_detail', lol_add_api_auth({ post_seq: seq, android_id: g_lol_android_id }))
}

/* 본문 수신 (글이 없거나 실패하면 post_seq가 비어 있고 requested_seq만 있다) */
function lol_on_article_detail(data)
{
	var loading = g_lol_detail_loading
	if(!loading || loading.seq != (data.requested_seq || data.post_seq))
		return // 그사이 다른 글을 눌렀다
	loading.post = data
	if(loading.replys)
		clearTimeout(loading.timer)

	g_lol_same_article_prev = Boolean(g_lol_current_detail && data.post_seq && g_lol_current_detail['post_seq'] == data.post_seq)

	// 댓글: 먼저 와 있으면 그것, 새로고침이면 새 댓글이 올 때까지 지금 댓글, 아니면 불러오는 중(null)
	if(loading.replys)
		data.replys = loading.replys
	else if(g_lol_same_article_prev)
		data.replys = g_lol_current_detail['replys']
	else
		data.replys = null

	if(data['my_post'] != '1' && lol_is_my_content(data['author_id']))
		data['my_post'] = '1' // [v2] 레거시 계정은 작성자 id 가 legacy_id 로 온다 (서버도 같은 보정을 하지만 혹시 몰라서)

	g_lol_current_detail = data
	if(!g_lol_same_article_prev)
		lol_reply_target_clear() // [v2] 다른 글로 넘어가면 답글 대상 해제

	lol_write_panel_toggle(false)
	lol_rpanel_refresh.style.display = 'block'
	lol_rpanel_update()
	lol_mobile_show_detail(true)
}

/* 댓글 수신 */
function lol_on_article_replies(data)
{
	var loading = g_lol_detail_loading
	if(!loading || loading.seq != data.post_seq || loading.replys)
		return
	loading.replys = data.replys
	if(loading.post)
		clearTimeout(loading.timer)
	if(data.failed)
		loading.replys.failed = true

	// 본문이 아직이면 본문이 올 때 같이 그린다
	if(loading.post && g_lol_current_detail && g_lol_current_detail['post_seq'] == data.post_seq)
	{
		g_lol_current_detail['replys'] = loading.replys
		lol_rpanel_update_replys()
	}
}

/* ---------- 시간 표시 ----------
   24시간 이내는 "n초 전 / n분 전 / n시간 전"(마우스를 올리면 정확한 시각), 그 이후는 한국 시각.
   서버는 'YYYY-MM-DD HH:mm:ss'(한국 시각)로 보내지만, 북마크 보관본 같은 예전 데이터에는
   'T'나 '+09:00'이 붙어 있을 수 있어서 여기서도 같은 형식으로 맞춘다 */
var lol_time_reg = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/
const LOL_KST_OFFSET_MS = 9 * 60 * 60 * 1000

/* 시각 문자열 → 밀리초. 시각이 아니면 null, 시간대가 없으면 한국 시각으로 본다 */
function lol_parse_time(value)
{
	var m = lol_time_reg.exec(String(value || '').trim())
	if(!m)
		return null

	var ms = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))
	if(!m[7])
		return ms - LOL_KST_OFFSET_MS
	if(m[7] == 'Z')
		return ms
	var sign = m[7][0] == '-' ? -1 : 1
	var digits = m[7].slice(1).replace(':', '')
	return ms - sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60 * 1000
}

/* 밀리초 → 한국 시각 'YYYY-MM-DD HH:mm:ss' */
function lol_format_kst(ms)
{
	return new Date(ms + LOL_KST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

function lol_time_render(el)
{
	var ms = Number(el.getAttribute('lol_time'))
	var exact = lol_format_kst(ms)
	var diff = Math.floor((Date.now() - ms) / 1000)
	var text = exact
	var bucket = 'date' // 경과 구간 (색·굵기는 index.css [lol_bucket])

	if(diff < 24 * 60 * 60)
	{
		if(diff < 1)
		{
			text = '방금 전'
			bucket = 'now'
		}
		else if(diff < 60)
		{
			text = diff + '초 전'
			bucket = 'sec'
		}
		else if(diff < 60 * 60)
		{
			text = Math.floor(diff / 60) + '분 전'
			bucket = 'min'
		}
		else
		{
			text = Math.floor(diff / 3600) + '시간 전'
			bucket = 'hour'
		}
		el.setAttribute('lol_exact', exact)
	}
	else
		el.removeAttribute('lol_exact')

	if(el.getAttribute('lol_bucket') != bucket)
		el.setAttribute('lol_bucket', bucket)

	if(el.textContent != text)
		el.textContent = text
}

/* el에 시각 표시. 시각으로 읽을 수 없는 값은 fallback_html(없으면 값 그대로의 글자)로 둔다 */
function lol_set_time(el, value, fallback_html)
{
	var ms = lol_parse_time(value)
	if(ms === null)
	{
		el.removeAttribute('lol_time')
		el.removeAttribute('lol_exact')
		el.removeAttribute('lol_bucket')
		if(fallback_html === undefined)
			el.textContent = value || ''
		else
			el.innerHTML = fallback_html
		return
	}

	el.setAttribute('lol_time', ms)
	lol_time_render(el)
}

// "n초 전"이 흘러가도록 롤백 창이 열려 있는 동안 주기적으로 다시 그린다
setInterval(function() {
	if(g_lol_panel_show)
		document.querySelectorAll('[lol_time]').forEach(lol_time_render)
	if(g_lol_time_tip_target && !g_lol_time_tip_target.isConnected)
		lol_time_tip_hide()
}, 5000)

/* 상대 시간에 마우스를 올리면 정확한 시각을 바로 띄운다.
   title 툴팁은 늦게 뜨고 글자가 바뀌면(5초마다) 사라져서, 화면에 고정된 말풍선 하나를 직접 옮겨 쓴다.
   (title 속성을 쓰면 글목록 제목용 CSS '[title]'까지 걸려 시간 앞에 여백이 생기기도 했다) */
var g_lol_time_tip = null
var g_lol_time_tip_target = null

function lol_time_tip_hide()
{
	g_lol_time_tip_target = null
	if(g_lol_time_tip)
		g_lol_time_tip.style.display = 'none'
}

document.addEventListener('mouseover', function(event) {
	var el = event.target.closest ? event.target.closest('[lol_exact]') : null
	if(el == g_lol_time_tip_target)
		return
	if(!el)
	{
		lol_time_tip_hide()
		return
	}

	if(!g_lol_time_tip)
	{
		g_lol_time_tip = document.createElement('div')
		g_lol_time_tip.id = 'lol_time_tip'
		document.body.appendChild(g_lol_time_tip)
	}
	g_lol_time_tip_target = el
	g_lol_time_tip.textContent = el.getAttribute('lol_exact')
	g_lol_time_tip.style.display = 'block'

	// 시간 글자 바로 위 가운데. 위가 모자라면 아래, 화면 밖으로는 안 나가게.
	// 글 상세의 시간처럼 요소가 줄 전체 폭이면 요소 가운데가 글자와 멀어지므로, 글자가 차지한 영역을 기준으로 한다
	var range = document.createRange()
	range.selectNodeContents(el)
	var rect = range.getBoundingClientRect()
	if(!rect.width)
		rect = el.getBoundingClientRect()
	var width = g_lol_time_tip.offsetWidth
	var height = g_lol_time_tip.offsetHeight
	var left = Math.min(Math.max(4, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 4)
	var top = rect.top - height - 6
	if(top < 4)
		top = rect.bottom + 6
	g_lol_time_tip.style.left = left + 'px'
	g_lol_time_tip.style.top = top + 'px'
})

// 스크롤하면 글자와 말풍선이 어긋나므로 숨긴다
document.addEventListener('scroll', lol_time_tip_hide, true)

/* 불러오던 글 버리기: 서버 응답 없이 상세를 채우는 경로(어워드·북마크 보관본·아이콘 변경)에서,
   늦게 온 응답이 그 화면을 덮지 않게 한다 */
function lol_cancel_article_loading()
{
	if(g_lol_detail_loading)
		clearTimeout(g_lol_detail_loading.timer)
	g_lol_detail_loading = null
	lol_rpanel.removeAttribute('skeleton')
	lol_rpanel_reply_board.removeAttribute('skeleton')
}

/* 글 우클릭 -> 해당 글의 아카이브 정보 요청 */
function lol_onrclick_article()
{
	event.stopPropagation()
	event.preventDefault()

	var seq = event.currentTarget.getAttribute('seq')
	if(!seq)
	{
		console.log('seq가 없다?!', seq)
		return
	}

	if(g_lol_is_bookmark)
	{
		if(g_lol_android_id == g_lol_guest_id)
			return

		g_lol_rpanel_scroll_top_switch = true
		socket.emit('lol_query_bookmark_archived', { post_seq: seq, android_id: g_lol_android_id })
	}
	else if(g_lol_is_award)
	{
		lol_cancel_article_loading()
		g_lol_current_detail = lol_award_articles_body.filter(x => x['post_seq'] == seq)[0]

		lol_write_panel_toggle(false)
		lol_rpanel_refresh.style.display = 'block'
		g_lol_rpanel_scroll_top_switch = true
		lol_rpanel_update()
		lol_mobile_show_detail(true)
	}
}

/* 검색 버튼 클릭 */
function lol_onclick_search_button()
{
	if(g_lol_android_id != g_lol_guest_id)
	{
		lol_lpanel_search_menu_button_mine.firstChild.nodeValue = '내 글'
		lol_lpanel_search_menu_button_bookmark.firstChild.nodeValue = '북마크'
	}
	else
	{
		lol_lpanel_search_menu_button_mine.firstChild.nodeValue = '내 글 (로그인 필요)'
		lol_lpanel_search_menu_button_bookmark.firstChild.nodeValue = '북마크 (로그인 필요)'
	}

	lol_lpanel_search_menu.style.display = 'block'
}

/* 검색메뉴 배경 클릭 */
function lol_onclick_search_background() 
{
	lol_lpanel_search_menu.style.display = 'none'
}

/* 검색메뉴 내부 클릭 */
function lol_onclick_search_foreground()
{
	event.stopPropagation()
}

/* 검색 - 전체글 클릭 */
function lol_onclick_search_all()
{
	event.stopPropagation()
	lol_lpanel_search_menu.style.display = 'none'
	g_lol_search_body = ''
	g_lol_search_nick = ''
	g_lol_search_vote = false
	g_lol_search_mine = false
	g_lol_is_award = false
	g_lol_article_scroll_seq = 0
	g_lol_article_list = []
	g_lol_lpanel_scroll_top_switch = true
	g_lol_spec_android_id = g_lol_android_id
	lol_get_article_list(0, g_lol_search_vote ? 22 : 30, g_lol_search_body, g_lol_search_nick, g_lol_search_vote, g_lol_search_mine)
}

/* 검색 - 추천순 클릭 */
function lol_onclick_search_vote()
{
	event.stopPropagation()
	lol_lpanel_search_menu.style.display = 'none'
	g_lol_search_body = ''
	g_lol_search_nick = ''
	g_lol_search_vote = true
	g_lol_search_mine = false
	g_lol_is_award = false
	g_lol_article_scroll_seq = 0
	g_lol_article_list = []
	g_lol_lpanel_scroll_top_switch = true
	g_lol_spec_android_id = g_lol_android_id
	lol_get_article_list(0, g_lol_search_vote ? 22 : 30, g_lol_search_body, g_lol_search_nick, g_lol_search_vote, g_lol_search_mine)
}

/* 검색 - 내 글 클릭 */
function lol_onclick_search_mine()
{
	event.stopPropagation()
	if(g_lol_android_id == g_lol_guest_id)
		return

	lol_lpanel_search_menu.style.display = 'none'
	g_lol_search_body = ''
	g_lol_search_nick = ''
	g_lol_search_vote = false
	g_lol_search_mine = true
	g_lol_is_award = false
	g_lol_article_scroll_seq = 0
	g_lol_article_list = []
	g_lol_lpanel_scroll_top_switch = true
	g_lol_spec_android_id = g_lol_android_id
	lol_get_article_list(0, g_lol_search_vote ? 22 : 30, g_lol_search_body, g_lol_search_nick, g_lol_search_vote, g_lol_search_mine)
}

/* 검색 - 글검색 클릭 */
function lol_onclick_search_search()
{
	event.stopPropagation()
	var ans = prompt('글 검색: 검색어를 입력해주세요.')
	lol_lpanel_search_menu.style.display = 'none'

	if(!ans)
		return

	g_lol_search_body = ans
	g_lol_search_nick = ''
	g_lol_search_vote = false
	g_lol_search_mine = false
	g_lol_is_award = false
	g_lol_article_scroll_seq = 0
	g_lol_article_list = []
	g_lol_lpanel_scroll_top_switch = true
	g_lol_spec_android_id = g_lol_android_id
	lol_get_article_list(0, g_lol_search_vote ? 22 : 30, g_lol_search_body, g_lol_search_nick, g_lol_search_vote, g_lol_search_mine)
}

/* 검색 - 닉검색 클릭 */
function lol_onclick_search_nick()
{
	event.stopPropagation()
	var ans = prompt('닉 검색: 검색어를 입력해주세요.')
	lol_lpanel_search_menu.style.display = 'none'

	if(!ans)
		return

	g_lol_search_body = ''
	g_lol_search_nick = ans
	g_lol_search_vote = false
	g_lol_search_mine = false
	g_lol_is_award = false
	g_lol_article_scroll_seq = 0
	g_lol_article_list = []
	g_lol_lpanel_scroll_top_switch = true
	g_lol_spec_android_id = g_lol_android_id
	lol_get_article_list(0, g_lol_search_vote ? 22 : 30, g_lol_search_body, g_lol_search_nick, g_lol_search_vote, g_lol_search_mine)
}

/* 검색 - 북마크 클릭 */
function lol_onclick_search_bookmark()
{
	event.stopPropagation()
	if(g_lol_android_id == g_lol_guest_id)
		return

	lol_lpanel_search_menu.style.display = 'none'
	g_lol_search_body = ''
	g_lol_search_nick = ''
	g_lol_search_vote = false
	g_lol_search_mine = false
	g_lol_is_award = false
	g_lol_article_scroll_seq = 0
	g_lol_article_list = []
	g_lol_lpanel_scroll_top_switch = true
	g_lol_spec_android_id = g_lol_android_id
	g_lol_is_bookmark = true
	socket.emit('lol_query_bookmark_list', {android_id: g_lol_android_id, offset: g_lol_article_scroll_seq, count: 30})
}

var lol_award_articles_list = [
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7642551",
        "icon_img": "img_-3488732_20221029211151.jpg",
        "badge_use": "0",
        "post_title": "작성자싫으면",
        "nickname": "모코땅",
        "post_date": "2022-01-16 01:12:39   ",
        "likes": 27,
        "reply_cnt": 11,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "",
        "views": 462,
        "before": "2022-01-16"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7954432",
        "icon_img": "img_-3714479_20221223011415.jpg",
        "badge_use": "173",
        "post_title": "조심하세요",
        "nickname": "의왕참킥",
        "post_date": "2022-12-22 17:32:11   ",
        "likes": 27,
        "reply_cnt": 1,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "",
        "views": 400,
        "before": "2022-12-22"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7915204",
        "icon_img": "img_2511566_20220523163447.jpg",
        "badge_use": "401",
        "post_title": "삼지 칼로 찔러서 죽이고싶으면 추천",
        "nickname": "설포",
        "post_date": "2022-10-25 00:20:16   ",
        "likes": 25,
        "reply_cnt": 12,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_-8080843_20221025002018.jpg",
        "pic_multi": "",
        "views": 507,
        "before": "2022-10-25"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7885469",
        "icon_img": "img_1669257_20220119045612.jpg",
        "badge_use": "4317",
        "post_title": "니지우에 후장따줄게",
        "nickname": "남런",
        "post_date": "2022-09-14 18:30:44   ",
        "likes": 24,
        "reply_cnt": 17,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "",
        "views": 668,
        "before": "2022-09-14"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7940335",
        "icon_img": "img_3898397_20221222162300.jpg",
        "badge_use": "4312",
        "post_title": "다 알려주겠어",
        "nickname": "핑크턱맘",
        "post_date": "2022-11-28 00:00:27   ",
        "likes": 19,
        "reply_cnt": 40,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_7653851_20221128000028.jpg",
        "pic_multi": "",
        "views": 809,
        "before": "2022-11-28"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7872085",
        "icon_img": "img_7585897_20221127180936.jpg",
        "badge_use": "0",
        "post_title": "바선생 씨발 고아년아",
        "nickname": "DM으로부탁드려요",
        "post_date": "2022-08-28 21:47:03   ",
        "likes": 19,
        "reply_cnt": 4,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "",
        "views": 550,
        "before": "2022-08-28"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7621131",
        "icon_img": "img_-5997024_20220724203239.jpg",
        "badge_use": "104",
        "post_title": "얼랭이랑 놀아줄지 말지 튜표합시다",
        "nickname": "천아연­",
        "post_date": "2022-01-03 15:22:10   ",
        "likes": 19,
        "reply_cnt": 4,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_3617974_20220103152211.gif",
        "pic_multi": "",
        "views": 391,
        "before": "2022-01-03"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7806500",
        "icon_img": "img_-1793610_20220925185031.jpg",
        "badge_use": "",
        "post_title": "훈련소에 들어간 김네모...",
        "nickname": "안녕1",
        "post_date": "2022-06-16 06:31:54   ",
        "likes": 18,
        "reply_cnt": 9,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "",
        "views": 768,
        "before": "2022-06-16"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7733969",
        "icon_img": "img_-1857142_20221215162840.jpg",
        "badge_use": "214",
        "post_title": "그럼 스택파밍좀하게",
        "nickname": "더즌메렁",
        "post_date": "2022-03-24 08:18:18   ",
        "likes": 18,
        "reply_cnt": 16,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_2799231_20220324081818.jpg",
        "pic_multi": "",
        "views": 481,
        "before": "2022-03-24"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7649233",
        "icon_img": "img_2511566_20220523163447.jpg",
        "badge_use": "401",
        "post_title": "요즘 삼지 안와서 좋다",
        "nickname": "토순",
        "post_date": "2022-01-19 23:44:59   ",
        "likes": 18,
        "reply_cnt": 3,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_7912530_20220119234500.jpg",
        "pic_multi": "",
        "views": 355,
        "before": "2022-01-19"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7752408",
        "icon_img": "img_-623849_20221025015556.jpg",
        "badge_use": "4320",
        "post_title": "념글 지금 봤노 ㅋㅋ",
        "nickname": "광삼123",
        "post_date": "2022-04-15 00:05:17   ",
        "likes": 17,
        "reply_cnt": 6,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "",
        "views": 1287,
        "before": "2022-04-15"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7743373",
        "icon_img": "img_8298953_20221207012841.jpg",
        "badge_use": "0",
        "post_title": "리포네",
        "nickname": "기뮤",
        "post_date": "2022-04-04 10:41:52   ",
        "likes": 17,
        "reply_cnt": 5,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "",
        "views": 545,
        "before": "2022-04-04"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7703654",
        "icon_img": "",
        "badge_use": "0",
        "post_title": "오타쿠 일침날리고 차단함",
        "nickname": "하이르늫4",
        "post_date": "2022-02-25 23:16:06   ",
        "likes": 17,
        "reply_cnt": 14,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "img_6002993_20220225231605.jpg/img_1938404_20220225231605.jpg/img_3164243_20220225231605.jpg/",
        "views": 515,
        "before": "2022-02-25"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7685894",
        "icon_img": "img_-3488732_20221029211151.jpg",
        "badge_use": "0",
        "post_title": "야이개씨발새끼들이ㅡ ㅋㅋㅋㅋㅋ",
        "nickname": "모코땅",
        "post_date": "2022-02-12 12:29:33   ",
        "likes": 17,
        "reply_cnt": 28,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_486348_20220212122930.jpg",
        "pic_multi": "",
        "views": 586,
        "before": "2022-02-12"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7916149",
        "icon_img": "img_721074_20221224205202.jpg",
        "badge_use": "0",
        "post_title": "오즈 븅신",
        "nickname": "안녕1",
        "post_date": "2022-10-25 18:28:31   ",
        "likes": 16,
        "reply_cnt": 4,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "",
        "views": 386,
        "before": "2022-10-25"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7915242",
        "icon_img": "img_3897523_20220816104625.jpg",
        "badge_use": "346",
        "post_title": "이게 AI라니",
        "nickname": "프듀서22",
        "post_date": "2022-10-25 00:36:30   ",
        "likes": 16,
        "reply_cnt": 19,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_-4453710_20221025003631.jpg",
        "pic_multi": "",
        "views": 680,
        "before": "2022-10-25"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7769174",
        "icon_img": "img_3408720_20221224122142.jpg",
        "badge_use": "0",
        "post_title": "시발 개ㅈ됌ㅅ다",
        "nickname": "인공사(레알)",
        "post_date": "2022-05-04 17:01:25   ",
        "likes": 16,
        "reply_cnt": 11,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_7209136_20220504170126.jpg",
        "pic_multi": "",
        "views": 632,
        "before": "2022-05-04"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7759543",
        "icon_img": "img_2511566_20220523163447.jpg",
        "badge_use": "401",
        "post_title": "2022 유행어 등재 요청",
        "nickname": "극단적웃음주의자",
        "post_date": "2022-04-23 12:00:10   ",
        "likes": 16,
        "reply_cnt": 10,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_3078014_20220423030011.jpg",
        "pic_multi": "",
        "views": 561,
        "before": "2022-04-23"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7948746",
        "icon_img": "img_-3809421_20221217134325.jpg",
        "badge_use": "4317",
        "post_title": "..",
        "nickname": "유동Vsss58P2",
        "post_date": "2022-12-12 16:32:52   ",
        "likes": 15,
        "reply_cnt": 18,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "img_-7332510_20221212163252.jpg",
        "pic_multi": "",
        "views": 825,
        "before": "2022-12-12"
    },
    {
        "Owner": "4845f22a85cfb889",
        "post_seq": "7789318",
        "icon_img": "img_-6642295_20221217101123.jpg",
        "badge_use": "0",
        "post_title": "2시간뒤 무시로글 예상",
        "nickname": "프라이드",
        "post_date": "2022-05-29 17:17:49   ",
        "likes": 15,
        "reply_cnt": 2,
        "youtube_url": "",
        "doodlr": "0",
        "pic_new": "",
        "pic_multi": "",
        "views": 457,
        "before": "2022-05-29"
    }
]

var lol_award_articles_body = [
	{
		"post_seq": "7642551",
		"icon_img": "img_-3488732_20221029211151.jpg",
		"badge_use": "0",
		"post_title": "작성자싫으면",
		"nickname": "모코땅",
		"post_date": "2022-01-16 01:12:39   ",
		"likes": 27,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_1397832_20221211094606.jpg",
				"nickname": "이슬3",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13126635",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-16&lt;/font&gt;",
				"reply_title": "ㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴ"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13126636",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-16&lt;/font&gt;",
				"reply_title": "미친새기마냥개추"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3488732_20221029211151.jpg",
				"nickname": "모코땅",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13126638",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-16&lt;/font&gt;",
				"reply_title": "흠.."
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "슬비♡",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13127444",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-16&lt;/font&gt;",
				"reply_title": "전 모코땅님이 안갔으면좋겠어요"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13128512",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-16&lt;/font&gt;",
				"reply_title": "누구냐진짜"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1857142_20221215162840.jpg",
				"nickname": "하사(진)연님",
				"badge_use": "214",
				"reply_img": "",
				"reply_seq": "13128523",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-16&lt;/font&gt;",
				"reply_title": "누가울쟈기괴롭심？"
			},
			{
				"my_post": "0",
				"icon_img": "img_5698659_20220401224440.jpg",
				"nickname": "복받으세요",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13128672",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-16&lt;/font&gt;",
				"reply_title": "에휴 어떤 악질유저가 모코땅님 괴롭혀 ㅉ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13129090",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-16&lt;/font&gt;",
				"reply_title": "누구얌;"
			},
			{
				"my_post": "0",
				"icon_img": "img_7960635_20220124235147.jpg",
				"nickname": "쌈바마초펌킨",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13129249",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-16&lt;/font&gt;",
				"reply_title": "누가 추천누러"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1793610_20220925185031.jpg",
				"nickname": "안녕1",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13132098",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-17&lt;/font&gt;",
				"reply_title": "추천레전드"
			},
			{
				"my_post": "0",
				"icon_img": "img_-7272299_20220207092420.jpg",
				"nickname": "유동c5eb93",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13132422",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-17&lt;/font&gt;",
				"reply_title": "자게인원이 이렇게많나"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "",
		"post_text": "빨리군대로꺼졌으연</small></big></small></big></small></big></u></b></font></i><br><p><small><font size=1 color=#006699><b>[한마디]</b> https://youtu.be/qNWtA9w1y9w</small></big></font>",
		"views": 462,
		"doodlrurls": "",
		"fixedpic": "img_-568186_20221217053949.jpg",
		"stack": "(183099 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7954432",
		"icon_img": "img_-3714479_20221223011415.jpg",
		"badge_use": "173",
		"post_title": "조심하세요",
		"nickname": "의왕참킥",
		"post_date": "2022-12-22 17:32:11   ",
		"likes": 27,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_-3714479_20221223011415.jpg",
				"nickname": "의왕참킥",
				"badge_use": "173",
				"reply_img": "",
				"reply_seq": "13741875",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-22&lt;/font&gt;",
				"reply_title": ".."
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "",
		"post_text": "댓글없이 추천만있는글을 조심하세요",
		"views": 400,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(10230 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7915204",
		"icon_img": "img_2511566_20220523163447.jpg",
		"badge_use": "401",
		"post_title": "삼지 칼로 찔러서 죽이고싶으면 추천",
		"nickname": "설포",
		"post_date": "2022-10-25 00:20:16   ",
		"likes": 25,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_-6642295_20221217101123.jpg",
				"nickname": "프라이드",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671838",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "타다다ㅏ다다ㅏ닥"
			},
			{
				"my_post": "0",
				"icon_img": "img_5461074_20221218150302.jpg",
				"nickname": "너란걸알고있었어",
				"badge_use": "492",
				"reply_img": "",
				"reply_seq": "13671839",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "추천개잘오르농"
			},
			{
				"my_post": "0",
				"icon_img": "img_3610060_20221222231236.jpg",
				"nickname": "그런갑다",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671840",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "추신수 홈런ㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_9251872_20221118022800.jpg",
				"nickname": "머긁뾰긁견",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671841",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_3897523_20220816104625.jpg",
				"nickname": "프듀서22",
				"badge_use": "346",
				"reply_img": "img_-26313_20221025002058.jpg",
				"reply_seq": "13671843",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "- "
			},
			{
				"my_post": "0",
				"icon_img": "img_1397832_20221211094606.jpg",
				"nickname": "이슬3",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13671852",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "비상 비상"
			},
			{
				"my_post": "0",
				"icon_img": "img_1397832_20221211094606.jpg",
				"nickname": "이슬3",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13671853",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "하늘로 비상"
			},
			{
				"my_post": "0",
				"icon_img": "img_-6642295_20221217101123.jpg",
				"nickname": "프라이드",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671995",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": " 양지비상"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13673427",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "프라이드군은 끝나고 남으세요"
			},
			{
				"my_post": "0",
				"icon_img": "img_721074_20221224205202.jpg",
				"nickname": "안녕1",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13673554",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1857142_20221215162840.jpg",
				"nickname": "더즌메렁",
				"badge_use": "214",
				"reply_img": "img_-33130_20221025180516.jpg",
				"reply_seq": "13674212",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "비상！！！ 비상！！！"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "괴구리",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13675059",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "w댓내"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_-8080843_20221025002018.jpg",
		"pic_multi": "",
		"post_text": "삼지는 내가 5년 정도 봤는데 교화 가능성이 없는거같음",
		"views": 507,
		"doodlrurls": "",
		"fixedpic": "img_-5905806_20221012154610.jpg",
		"stack": "(235268 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7885469",
		"icon_img": "img_1669257_20220119045612.jpg",
		"badge_use": "4317",
		"post_title": "니지우에 후장따줄게",
		"nickname": "남런",
		"post_date": "2022-09-14 18:30:44   ",
		"likes": 24,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_4154151_20221121210910.jpg",
				"nickname": "니지우에",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13614663",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "？？？"
			},
			{
				"my_post": "0",
				"icon_img": "img_4154151_20221121210910.jpg",
				"nickname": "니지우에",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13614678",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "이글 추천누르지마세요"
			},
			{
				"my_post": "0",
				"icon_img": "img_8298953_20221207012841.jpg",
				"nickname": "기뮤",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13614733",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "추천"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "밋쯔",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13614791",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "오.."
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공사(레알)",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13614792",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "캬 "
			},
			{
				"my_post": "0",
				"icon_img": "img_3610060_20221222231236.jpg",
				"nickname": "금느",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13614793",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "캬역시똥남런이다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3488732_20221029211151.jpg",
				"nickname": "모코땅",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13614808",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "씨발내거야"
			},
			{
				"my_post": "0",
				"icon_img": "img_4154151_20221121210910.jpg",
				"nickname": "니지우에",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13614819",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "먼 미친소리에요 "
			},
			{
				"my_post": "0",
				"icon_img": "img_8390610_20220912115407.jpg",
				"nickname": "기뮤,",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13615006",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "니지우에댓글자꾸확인하는거소름"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "밋쯔",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13615012",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-14&lt;/font&gt;",
				"reply_title": "인정"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "밋쯔",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13615174",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-15&lt;/font&gt;",
				"reply_title": "니쥬엥"
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "행복한동물세상",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13615188",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-15&lt;/font&gt;",
				"reply_title": "니지두에와 창런 ㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "밋쯔",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13615251",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-15&lt;/font&gt;",
				"reply_title": "웽 "
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "에낫",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13615891",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-15&lt;/font&gt;",
				"reply_title": "쥬웽"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13615916",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-15&lt;/font&gt;",
				"reply_title": "두창"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "에낫",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13617221",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-15&lt;/font&gt;",
				"reply_title": "인정"
			},
			{
				"my_post": "0",
				"icon_img": "img_1978972_20221224210635.jpg",
				"nickname": "다정이",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13618455",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-09-16&lt;/font&gt;",
				"reply_title": "어른이 되는거야"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "",
		"post_text": "ㅇㅇ</small></big></small></big></small></big></u></b></font></i><br><p><small><font size=1 color=#006699><b>[한마디]</b> 한마디</small></big></font>",
		"views": 668,
		"doodlrurls": "",
		"fixedpic": "img_-4865115_20221130103536.jpg",
		"stack": "(958216 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7940335",
		"icon_img": "img_3898397_20221222162300.jpg",
		"badge_use": "4312",
		"post_title": "다 알려주겠어",
		"nickname": "핑크턱맘",
		"post_date": "2022-11-28 00:00:27   ",
		"likes": 19,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_-3633027_20221224215401.jpg",
				"nickname": "토네이도초코쿠키",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13718628",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "생일축하"
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "설포",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13718630",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "생일축하"
			},
			{
				"my_post": "0",
				"icon_img": "img_-8715349_20221219102236.jpg",
				"nickname": "김밥맛",
				"badge_use": "418",
				"reply_img": "",
				"reply_seq": "13718631",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "미친씨빨"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13718633",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "코코로 생일 뭐냐고~！"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5471063_20221030202900.jpg",
				"nickname": "군꺽샤싱",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13718635",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "오늘은 유어데이"
			},
			{
				"my_post": "0",
				"icon_img": "img_1978972_20221224210635.jpg",
				"nickname": "다정이",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13718640",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "생일축하~"
			},
			{
				"my_post": "0",
				"icon_img": "img_4405889_20221106151102.jpg",
				"nickname": "김덕배",
				"badge_use": "475",
				"reply_img": "",
				"reply_seq": "13718642",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "축하합니다(히요코톤으로"
			},
			{
				"my_post": "0",
				"icon_img": "img_5698659_20220401224440.jpg",
				"nickname": "복받으세요",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13718644",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "정말축하행"
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공샤샤샥",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13718646",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "오메데토"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "img_81005_20221128002025.jpg",
				"reply_seq": "13718648",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "축하합니다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1857142_20221215162840.jpg",
				"nickname": "더즌메렁",
				"badge_use": "214",
				"reply_img": "",
				"reply_seq": "13718666",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "생일축하해코코로"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3679224_20221005225918.jpg",
				"nickname": "리포네",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13718668",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "https://youtu.be/E7YPOGfdwVY"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3714479_20221223011415.jpg",
				"nickname": "判定",
				"badge_use": "173",
				"reply_img": "",
				"reply_seq": "13718674",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "축하합니다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-623849_20221025015556.jpg",
				"nickname": "오늘내생일2",
				"badge_use": "4320",
				"reply_img": "",
				"reply_seq": "13718689",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "축하합니다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-9703572_20221223114900.jpg",
				"nickname": "메꿍",
				"badge_use": "189",
				"reply_img": "",
				"reply_seq": "13718712",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "축하햏"
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "육수",
				"badge_use": "0",
				"reply_img": "img_-22432_20221128032308.jpg",
				"reply_seq": "13718750",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "축하"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13718782",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "생일축하"
			},
			{
				"my_post": "0",
				"icon_img": "img_4154151_20221121210910.jpg",
				"nickname": "니지우에",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13718816",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "생ㅇ리축하해"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13718871",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "니지우에오타컨셉**"
			},
			{
				"my_post": "0",
				"icon_img": "img_-6642295_20221217101123.jpg",
				"nickname": "프라이드",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13718890",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "준서군 축하하네"
			},
			{
				"my_post": "0",
				"icon_img": "img_3898397_20221222162300.jpg",
				"nickname": "울어라지옥참치통",
				"badge_use": "4312",
				"reply_img": "",
				"reply_seq": "13718917",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "응 생일지나도 안내릴거야 ㅂㄷㅂㄷ？ 앙 로모띠 로이조식 추천즐찾 "
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13718927",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "구독과좋아요알람설정추천과즐겨찾기까지앙기뮤"
			},
			{
				"my_post": "0",
				"icon_img": "img_-302775_20221112111054.jpg",
				"nickname": "종건급고졸",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13718979",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "안지나도 그냥 내려라"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3488732_20221029211151.jpg",
				"nickname": "모코땅",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13719224",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "준서야축하한다이기"
			},
			{
				"my_post": "0",
				"icon_img": "",
				"nickname": "바위처럼말랑하게",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13719261",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-28&lt;/font&gt;",
				"reply_title": "준서뽀뽀쪽"
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "육수",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13719926",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "지 "
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "육수",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13719928",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "으 "
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "육수",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13719930",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "글 "
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "육수",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13719933",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "리 "
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13719955",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "캬！！！@@@@@@@！！！！@@！！！！！！"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13720229",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "생！！！！@@@！！일！！@@@！！！！@@@！！！"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13720401",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "축하해！！！@@@！！！@@@@@@！！！@！！！@@@！！！"
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공샤샤샥",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13720433",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "지났으면 "
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13720441",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "내리긴.뭘.내려.변기.물이나.내리라"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1857142_20221215162840.jpg",
				"nickname": "더즌메렁",
				"badge_use": "214",
				"reply_img": "",
				"reply_seq": "13720498",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "호날두 감다뒤졋네 작작해라"
			},
			{
				"my_post": "0",
				"icon_img": "img_3898397_20221222162300.jpg",
				"nickname": "울어라지옥참치통",
				"badge_use": "4312",
				"reply_img": "img_2329054_20221129090733.jpg",
				"reply_seq": "13720720",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "오니니나레"
			},
			{
				"my_post": "0",
				"icon_img": "img_3123166_20221212193128.jpg",
				"nickname": "보고있어요",
				"badge_use": "191",
				"reply_img": "",
				"reply_seq": "13720805",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "생일지났으면글내려라"
			},
			{
				"my_post": "0",
				"icon_img": "img_2018703_20221203114027.jpg",
				"nickname": "머신건소녀는우울을쏜다",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13720829",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "생일축하해"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13720840",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-11-29&lt;/font&gt;",
				"reply_title": "뭐？"
			},
			{
				"my_post": "0",
				"icon_img": "img_9251872_20221118022800.jpg",
				"nickname": "카미사토류",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13723422",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-01&lt;/font&gt;",
				"reply_title": "축하합니다"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_7653851_20221128000028.jpg",
		"pic_multi": "",
		"post_text": "왇물원 프리터",
		"views": 809,
		"doodlrurls": "",
		"fixedpic": "img_3846606_20221224153925.jpg",
		"stack": "(3397 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7872085",
		"icon_img": "img_7585897_20221127180936.jpg",
		"badge_use": "0",
		"post_title": "바선생 씨발 고아년아",
		"nickname": "DM으로부탁드려요",
		"post_date": "2022-08-28 21:47:03   ",
		"likes": 19,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_9251872_20221118022800.jpg",
				"nickname": "혜은",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13588485",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-08-28&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공사(레알)",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13588599",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-08-28&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_1397832_20221211094606.jpg",
				"nickname": "이슬3",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13588714",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-08-29&lt;/font&gt;",
				"reply_title": "시끄럽게올라가는추천수"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13588725",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-08-29&lt;/font&gt;",
				"reply_title": "좆됐네이거"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "",
		"post_text": "내가 너 또그러면 패죽인다했지",
		"views": 550,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(19332 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7621131",
		"icon_img": "img_-5997024_20220724203239.jpg",
		"badge_use": "104",
		"post_title": "얼랭이랑 놀아줄지 말지 튜표합시다",
		"nickname": "천아연­",
		"post_date": "2022-01-03 15:22:10   ",
		"likes": 19,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13076740",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-03&lt;/font&gt;",
				"reply_title": "조용필"
			},
			{
				"my_post": "0",
				"icon_img": "img_-4538849_20220903002125.jpg",
				"nickname": "고은",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13076741",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-03&lt;/font&gt;",
				"reply_title": "잔인하게 올 차단해서 지혼자 글쓰게합시다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-9253421_20221104012304.jpg",
				"nickname": "얼랭님",
				"badge_use": "265",
				"reply_img": "",
				"reply_seq": "13076746",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-03&lt;/font&gt;",
				"reply_title": "주작기 ㄴㄴ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13082188",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-04&lt;/font&gt;",
				"reply_title": "헉 "
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_3617974_20220103152211.gif",
		"pic_multi": "",
		"post_text": "놀아줘야 된다고 생각하면 비추\r\n\r\n아니라 생각하면 개추",
		"views": 391,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(9283 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7806500",
		"icon_img": "img_-1793610_20220925185031.jpg",
		"badge_use": "",
		"post_title": "훈련소에 들어간 김네모...",
		"nickname": "안녕1",
		"post_date": "2022-06-16 06:31:54   ",
		"likes": 18,
		"replys": [
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "만악의정원",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13459078",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-06-16&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_8298953_20221207012841.jpg",
				"nickname": "기뮤",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13459079",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-06-16&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13459080",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-06-16&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3132020_20221026210704.jpg",
				"nickname": "seXxXxX",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13459082",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-06-16&lt;/font&gt;",
				"reply_title": "여름이라 초코바 다 녹을거같은데요.."
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "만악의정원",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13459083",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-06-16&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "만악의정원",
				"badge_use": "401",
				"reply_img": "img_7961031_20220615213514.jpg",
				"reply_seq": "13459085",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-06-16&lt;/font&gt;",
				"reply_title": "참고로 뒤에 서있던 건 이 남성"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13459094",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-06-16&lt;/font&gt;",
				"reply_title": "난바빠"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13459228",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-06-16&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋ 미치겠네 진자 ㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-8329054_20221204131625.jpg",
				"nickname": "에양",
				"badge_use": "159",
				"reply_img": "",
				"reply_seq": "13459451",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-06-16&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ시발"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "",
		"post_text": "훈련 뒤에 잠시 주어진 휴식시간.\r\n\r\n병사들은 저마다 각자의 방법으로 피로를 풀어내고있다.\r\n\r\n\r\n′아~ 피자먹고싶다.′\r\n\r\n′나는 짜장면.′\r\n\r\n\r\n시시콜콜한 이야기들을 주고받는 병사들을 뒤로 한채 김네모는 외진 곳으로 발걸음을 옮겼다.\r\n\r\n\r\n′븅신들.′\r\n\r\n\r\n바스락ㅡ\r\n\r\n김네모의 허리춤으로부터 익숙한 소리가 들려온다.\r\n\r\n그건 바로 며칠 전 부식으로 받은 초코바의 포장지 소리.\r\n\r\n남들은 받자마자 눈이 뒤집힌채 허겁지겁 먹어버렸지만, 김네모는 달랐다.\r\n\r\n힘든 훈련이 끝나고 난 뒤에 먹기위해 영겁의 시간을 버텨낸 것이다.\r\n\r\n이게 만약 마시멜로 실험이었다면, 아마 손에 가득 담아도 넘쳐날 정도의 마시멜로를 받았겠지.\r\n\r\n\r\n그가 천천히 초코바를 꺼내들었다.\r\n\r\n포장지를 벗긴다.\r\n\r\n조심조심.\r\n\r\n조금이라도 손실되는 부분이 없도록.\r\n\r\n부드럽게.\r\n\r\n입에 넣는다.\r\n\r\n\r\n순식간에 가득 퍼지는 초코 향, 그와 동시에 은은하게 초코 향을 감싸 안는 아몬드의 고소한 맛.\r\n\r\n한 입 더 베어 물자 아몬드 안에 감춰져있던 짭짤한 맛까지.\r\n\r\n기존의 맛과 합쳐져 만들어진, 이른바 맛의 쓰나미가 혀를 덮쳐온다.\r\n\r\n\r\n′크크크크크크크크큭.′\r\n\r\n\r\n노래가 절로 튀어나온다.\r\n\r\n\r\n′난바빠 노무바빠...′\r\n\r\n\r\n헉！\r\n\r\n본능적으로 가장 신난다고 생각했던 노래가 튀어나왔다.\r\n\r\n하지만 이는 다른 사람에게 절대로 들켜선안될 금단의 노래.\r\n\r\n혹시나 누군가 들었을까 재빠르게 주위를 살핀다.\r\n\r\n그 때, 나지막하게 들려오는 목소리.\r\n\r\n\r\n′따악 따악 따악 따악′\r\n\r\n\r\n급하게 뒤돌아본 김네모의 눈에 비친건 너무나도 익숙한 실루엣.\r\n\r\n반복된 학습은 기억하기에 가장 효과적이라 했던가.\r\n\r\n자유게시판을 이용하며 수도 없이 보았던 [누군가]를 표현한 그림.\r\n\r\n\r\n′...프라이드？′\r\n\r\n\r\n김네모의 입에서 너무나도 자연스럽게 튀어나온 한마디였다.\r\n",
		"views": 768,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(11194 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7733969",
		"icon_img": "img_-1857142_20221215162840.jpg",
		"badge_use": "214",
		"post_title": "그럼 스택파밍좀하게",
		"nickname": "더즌메렁",
		"post_date": "2022-03-24 08:18:18   ",
		"likes": 18,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13325300",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "축하합니다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3714479_20221223011415.jpg",
				"nickname": "우동furhcu23",
				"badge_use": "173",
				"reply_img": "",
				"reply_seq": "13325306",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "축하합니다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-9253421_20221104012304.jpg",
				"nickname": "얼랭님",
				"badge_use": "265",
				"reply_img": "",
				"reply_seq": "13325308",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "탄죠비 오메데토~"
			},
			{
				"my_post": "0",
				"icon_img": "img_3897523_20220816104625.jpg",
				"nickname": "프듀서22",
				"badge_use": "346",
				"reply_img": "",
				"reply_seq": "13325310",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "와캬퍄"
			},
			{
				"my_post": "0",
				"icon_img": "img_-8329054_20221204131625.jpg",
				"nickname": "로하이",
				"badge_use": "159",
				"reply_img": "",
				"reply_seq": "13325355",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "앙♡♡♡♡"
			},
			{
				"my_post": "0",
				"icon_img": "",
				"nickname": "시노다하지메",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13325363",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "와오"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3633027_20221224215401.jpg",
				"nickname": "토네이도초코쿠키",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13325414",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "생일축하"
			},
			{
				"my_post": "0",
				"icon_img": "img_8390610_20220912115407.jpg",
				"nickname": "기뮤,",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13325521",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "콩 그레 츄 레이션 아아"
			},
			{
				"my_post": "0",
				"icon_img": "",
				"nickname": "웃지마",
				"badge_use": "161",
				"reply_img": "",
				"reply_seq": "13325592",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "추카추카"
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "비챤",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13325690",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "연시신아 축하혀"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13325717",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "오우"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13325873",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "연님 생일 뭐냐고~！"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3679224_20221005225918.jpg",
				"nickname": "리포네",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13326084",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "연신 축하함을 호소"
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공사(레알)",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13326368",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-24&lt;/font&gt;",
				"reply_title": "오메데토"
			},
			{
				"my_post": "0",
				"icon_img": "img_-8329054_20221204131625.jpg",
				"nickname": "로하이",
				"badge_use": "159",
				"reply_img": "",
				"reply_seq": "13326688",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-25&lt;/font&gt;",
				"reply_title": "생일지났으면 글내려라"
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공사(레알)",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13328160",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-26&lt;/font&gt;",
				"reply_title": "내리라"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_2799231_20220324081818.jpg",
		"pic_multi": "",
		"post_text": "추천좀수금할게</small></big></small></big></small></big></u></b></font></i><br><p><small><font size=1 color=#006699><b>[한마디]</b> 송하빵 갤러리 Here We Go</small></big></font>",
		"views": 481,
		"doodlrurls": "",
		"fixedpic": "img_-3889001_20221204220450.jpg",
		"stack": "(6903 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7649233",
		"icon_img": "img_2511566_20220523163447.jpg",
		"badge_use": "401",
		"post_title": "요즘 삼지 안와서 좋다",
		"nickname": "토순",
		"post_date": "2022-01-19 23:44:59   ",
		"likes": 18,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_1397832_20221211094606.jpg",
				"nickname": "이슬3",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13142678",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-19&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_5117593_20220205010424.jpg",
				"nickname": "도아가",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13144609",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-20&lt;/font&gt;",
				"reply_title": "돌아오지 마라 북한에서 살아라"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13153207",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-01-23&lt;/font&gt;",
				"reply_title": "끼야아아악"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_7912530_20220119234500.jpg",
		"pic_multi": "",
		"post_text": "\r\n\r\n진짜 행복하다",
		"views": 355,
		"doodlrurls": "",
		"fixedpic": "img_-5905806_20221012154610.jpg",
		"stack": "(235268 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7752408",
		"icon_img": "img_-623849_20221025015556.jpg",
		"badge_use": "4320",
		"post_title": "념글 지금 봤노 ㅋㅋ",
		"nickname": "광삼123",
		"post_date": "2022-04-15 00:05:17   ",
		"likes": 17,
		"replys": [
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "극단적웃음주의자",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13358561",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-15&lt;/font&gt;",
				"reply_title": "ㅈ됐네 이거"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13358562",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-15&lt;/font&gt;",
				"reply_title": "념글 나도봊ㄴ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-9253421_20221104012304.jpg",
				"nickname": "얼랭님",
				"badge_use": "265",
				"reply_img": "",
				"reply_seq": "13358563",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-15&lt;/font&gt;",
				"reply_title": "힝구"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13358564",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-15&lt;/font&gt;",
				"reply_title": "념글 좌표좀"
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "슬비빅",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13358626",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-15&lt;/font&gt;",
				"reply_title": "싸우지망...."
			},
			{
				"my_post": "0",
				"icon_img": "img_-3714479_20221223011415.jpg",
				"nickname": "미닝허트",
				"badge_use": "173",
				"reply_img": "",
				"reply_seq": "13359817",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-15&lt;/font&gt;",
				"reply_title": "음 "
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "",
		"post_text": "\r\n\r\n전판 탑에서 상대 어거지 4인갱 줫나오는거\r\n\r\n버티고 있는거만해도 좆같은데\r\n\r\n채팅으로 쓰레기라인 안감 이지랄하는거\r\n\r\n열받아도 내가 채팅 하나라도 침 ㅇㅇ ？\r\n\r\n내로남불 씹 ㅋㅋ\r\n\r\n안그래도 그판 좆같은거 분위기 곱창날까봐\r\n\r\n채팅 걍 안치고 있었는데\r\n\r\n그담판에\r\n\r\n야스오 유미봇듀\r\n\r\n초반에 더블킬따고 주도권 꽉쥐고 있는 상태라\r\n\r\n상대 여행다녀도\r\n\r\n걍 바텀 다이브킬 내는게 더맞다 판단했고\r\n\r\n그때 그라가스 정글도 말려서\r\n\r\n캠프돌기 바쁜데\r\n\r\n캠프돌기바쁜 그라가스를 탈까 ？\r\n\r\n타면 정글도는거 옆에서 구경함？\r\n\r\n그렇다고 유미가 미드까지 걸어서 로밍갈까 ？\r\n\r\n그때 팀 전체적으로 말린상태라\r\n\r\n바텀 다이브 트라이해서 도박이라도 안걸면\r\n\r\n그대로 겜질상황인데\r\n\r\n다이브중에 미스나온거랑\r\n\r\n렝가 탑버리고 뛰어서 로밍온거\r\n\r\n그거때매 바텀 밀렸구만 뭔 애미 씨발뒤진 소리임 ㅋㅋ\r\n\r\n그리고 니 중간에 바텀 그따구로 하지말라고 채팅친거\r\n\r\n그상황 난 귀환탐이라 집잡았고\r\n\r\n야스오 혼자 다이브치다 죽은건데\r\n\r\n그것도 나보고 한말임 씨발그럼 ㅋㅋ ？\r\n\r\n난 그 채팅 이후로 미드랑 정글 붙음 ㅇㅇ\r\n\r\n그러다 겜지고\r\n\r\n채팅으로 유미 그따구로 하지말라고 좆지랄하면\r\n\r\n친삭이 마렵냐 안마렵냐 ㅋㅋ\r\n\r\n니 중간에 첫번째 챗 칠때 바텀 상황 본건지 안본건지 모르겠지만\r\n\r\n그건 나 집탐일때 야스오 혼자 다이브친거임 븅신아 ㅋㅋ\r\n\r\n야스오도 싸잡아서 뭐라해야되는데 라에라서 욕하기는 싫고 그마인드 아님 ㅇㅇ？\r\n\r\n설령 내판단이 틀렸다고 쳐도\r\n\r\n충분히 납득가능한 판단이었고\r\n\r\n그렇게따지면 전판 니 탑 배제하고 플레이할때\r\n\r\n만약 다른데서 다이브치다 액시던트 나서 겜졌으면 ㅇㅇ？\r\n\r\n애초에 갤큐하면서 억울한상황 좆같은상황 한두번 나온게 아닌데\r\n\r\n갤큐니까 다들 걍 참고 하는거임 \r\n\r\n저스트 게임이니까 ㅇㅇ \r\n\r\n근데 씨발 채팅창 혼자쓰면서 범인찾기하는게 맞는거임 ㅇㅇ？\r\n\r\n열심히 안하기라도 했나 진짜 좆같네 ㅋㅋ\r\n\r\n내로남불도 정도껏해야지 \r\n\r\n에라이 씨발 ㅋ",
		"views": 1287,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(37739 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7743373",
		"icon_img": "img_8298953_20221207012841.jpg",
		"badge_use": "0",
		"post_title": "리포네",
		"nickname": "기뮤",
		"post_date": "2022-04-04 10:41:52   ",
		"likes": 17,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_5698659_20220401224440.jpg",
				"nickname": "복받으세요",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13342145",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-04&lt;/font&gt;",
				"reply_title": "헉 "
			},
			{
				"my_post": "0",
				"icon_img": "img_5698659_20220401224440.jpg",
				"nickname": "복받으세요",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13342146",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-04&lt;/font&gt;",
				"reply_title": "추천주작머고"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3679224_20221005225918.jpg",
				"nickname": "리포네",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13342158",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-04&lt;/font&gt;",
				"reply_title": "ㄲㅈ라"
			},
			{
				"my_post": "0",
				"icon_img": "img_2018703_20221203114027.jpg",
				"nickname": "매우살찐돼지",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13342343",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-04&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "극단적웃음주의자",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13343178",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-05&lt;/font&gt;",
				"reply_title": "리포네우는중"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "",
		"post_text": "좆만한련이 자꾸 깝치네 꺼져 그냥 ",
		"views": 545,
		"doodlrurls": "",
		"fixedpic": "img_2905746_20221029042744.jpg",
		"stack": "(1392 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7703654",
		"icon_img": "",
		"badge_use": "0",
		"post_title": "오타쿠 일침날리고 차단함",
		"nickname": "하이르늫4",
		"post_date": "2022-02-25 23:16:06   ",
		"likes": 17,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_3897523_20220816104625.jpg",
				"nickname": "프듀서22",
				"badge_use": "346",
				"reply_img": "",
				"reply_seq": "13264549",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-2954838_20220818202033.jpg",
				"nickname": "오네가이이",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13264559",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-25&lt;/font&gt;",
				"reply_title": "폐급과 폐급의 대결이네"
			},
			{
				"my_post": "0",
				"icon_img": "img_-8919624_20220717183037.jpg",
				"nickname": "샤르프르젝트",
				"badge_use": "130",
				"reply_img": "",
				"reply_seq": "13264576",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-25&lt;/font&gt;",
				"reply_title": "폐폐대"
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공사(레알)",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13264578",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_3123166_20221212193128.jpg",
				"nickname": "맙소사사사",
				"badge_use": "191",
				"reply_img": "",
				"reply_seq": "13264587",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13264720",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-26&lt;/font&gt;",
				"reply_title": "ㅈㄴ웃기네"
			},
			{
				"my_post": "0",
				"icon_img": "img_7268413_20220311113020.jpg",
				"nickname": "혜은",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13264848",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-26&lt;/font&gt;",
				"reply_title": "캬 "
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13264958",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-26&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_7960635_20220124235147.jpg",
				"nickname": "쌈바마초펌킨",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13265462",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-26&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_5879602_20210523093929.jpg",
				"nickname": "천향",
				"badge_use": "162",
				"reply_img": "",
				"reply_seq": "13265621",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-26&lt;/font&gt;",
				"reply_title": "와 ㄹㅇ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-9088505_20220911005750.jpg",
				"nickname": "빵구워요",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13266151",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-26&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13267921",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-27&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-7272299_20220207092420.jpg",
				"nickname": "아유무",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13269146",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-28&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13271581",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-03-01&lt;/font&gt;",
				"reply_title": "역시 하이르늫"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "img_6002993_20220225231605.jpg/img_1938404_20220225231605.jpg/img_3164243_20220225231605.jpg/",
		"post_text": "진짜 저런얘들은 군대부터 느끼는건데\r\n\r\n과학이더라",
		"views": 515,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(13103 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7685894",
		"icon_img": "img_-3488732_20221029211151.jpg",
		"badge_use": "0",
		"post_title": "야이개씨발새끼들이ㅡ ㅋㅋㅋㅋㅋ",
		"nickname": "모코땅",
		"post_date": "2022-02-12 12:29:33   ",
		"likes": 17,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_7268413_20220311113020.jpg",
				"nickname": "혜은",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13225696",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "캬 "
			},
			{
				"my_post": "0",
				"icon_img": "img_2018703_20221203114027.jpg",
				"nickname": "매우살찐돼지",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13225698",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "키키키"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13225700",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㄷㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_7026071_20221113151816.jpg",
				"nickname": "샤르룽",
				"badge_use": "337",
				"reply_img": "",
				"reply_seq": "13225702",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "자드가자익"
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공사(레알)",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13225711",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "시원하잇"
			},
			{
				"my_post": "0",
				"icon_img": "img_3897523_20220816104625.jpg",
				"nickname": "프듀서22",
				"badge_use": "346",
				"reply_img": "",
				"reply_seq": "13225713",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋ "
			},
			{
				"my_post": "0",
				"icon_img": "img_-8919624_20220717183037.jpg",
				"nickname": "소추",
				"badge_use": "130",
				"reply_img": "",
				"reply_seq": "13225716",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "이녀석머리가www"
			},
			{
				"my_post": "0",
				"icon_img": "img_1669257_20220119045612.jpg",
				"nickname": "남런",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13225723",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㅈ댓다~~~~"
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "토순",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13225739",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㅠㅠ"
			},
			{
				"my_post": "0",
				"icon_img": "img_4130156_20220209234111.jpg",
				"nickname": "POIU",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13225741",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_6368779_20210719125818.jpg",
				"nickname": "M?L",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13225745",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㅈ댓다 "
			},
			{
				"my_post": "0",
				"icon_img": "img_-7272299_20220207092420.jpg",
				"nickname": "아유무",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13225766",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "개ㅈ댓다ㅅㅂ"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13225767",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "멋있다 ㄹㅇ"
			},
			{
				"my_post": "0",
				"icon_img": "",
				"nickname": "코리밋_____",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13225811",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "가보자가보자"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13225821",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "시원~허이"
			},
			{
				"my_post": "0",
				"icon_img": "img_5698659_20220401224440.jpg",
				"nickname": "복받으세요",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13225835",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3633027_20221224215401.jpg",
				"nickname": "토네이도초코쿠키",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13225950",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1857142_20221215162840.jpg",
				"nickname": "더즌메렁",
				"badge_use": "214",
				"reply_img": "",
				"reply_seq": "13226004",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "캬 "
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "슬비♡",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13226446",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "잘가라 모코따땅"
			},
			{
				"my_post": "0",
				"icon_img": "img_881420_20220212101157.jpg",
				"nickname": "체리마루",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13226773",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋ하"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1551738_20220112091856.jpg",
				"nickname": "이렐리아vv",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13226869",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "대머리다ㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "",
				"nickname": "시노다하지메",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13226942",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13227139",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-12&lt;/font&gt;",
				"reply_title": "으악 1명더간다"
			},
			{
				"my_post": "0",
				"icon_img": "img_7960635_20220124235147.jpg",
				"nickname": "쌈바마초펌킨",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13228183",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-13&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_5561388_20220908163501.jpg",
				"nickname": "취중진담",
				"badge_use": "457",
				"reply_img": "",
				"reply_seq": "13228445",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-13&lt;/font&gt;",
				"reply_title": "푸하하하하하"
			},
			{
				"my_post": "0",
				"icon_img": "img_2018703_20221203114027.jpg",
				"nickname": "매우살찐돼지",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13233835",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-14&lt;/font&gt;",
				"reply_title": "입대했으면글내려라"
			},
			{
				"my_post": "0",
				"icon_img": "img_881420_20220212101157.jpg",
				"nickname": "딸기도넛",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13234456",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-14&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ매살돼 미친"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13237547",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-02-15&lt;/font&gt;",
				"reply_title": "글내려라"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_486348_20220212122930.jpg",
		"pic_multi": "",
		"post_text": "ㅋㅋㅋㅋㅋㅋ</small></big></small></big></small></big></u></b></font></i><br><p><small><font size=1 color=#006699><b>[한마디]</b> https://youtu.be/qNWtA9w1y9w</small></big></font>",
		"views": 586,
		"doodlrurls": "",
		"fixedpic": "img_-568186_20221217053949.jpg",
		"stack": "(183099 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7916149",
		"icon_img": "img_721074_20221224205202.jpg",
		"badge_use": "0",
		"post_title": "오즈 븅신",
		"nickname": "안녕1",
		"post_date": "2022-10-25 18:28:31   ",
		"likes": 16,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_-6642295_20221217101123.jpg",
				"nickname": "프라이드",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13675343",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-26&lt;/font&gt;",
				"reply_title": "1빠！！！！！！！！！！"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13675567",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-26&lt;/font&gt;",
				"reply_title": "ㄷㅊ"
			},
			{
				"my_post": "0",
				"icon_img": "img_1397832_20221211094606.jpg",
				"nickname": "이슬3",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13675631",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-26&lt;/font&gt;",
				"reply_title": "니나닥쳐"
			},
			{
				"my_post": "0",
				"icon_img": "img_8298953_20221207012841.jpg",
				"nickname": "기뮤",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13678674",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-28&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "",
		"post_text": "븅신",
		"views": 386,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(5783 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7915242",
		"icon_img": "img_3897523_20220816104625.jpg",
		"badge_use": "346",
		"post_title": "이게 AI라니",
		"nickname": "프듀서22",
		"post_date": "2022-10-25 00:36:30   ",
		"likes": 16,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_2018703_20221203114027.jpg",
				"nickname": "머신건소녀는우울을쏜다",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671906",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_9251872_20221118022800.jpg",
				"nickname": "머긁뾰긁견",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671909",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "사람의꿈은끝나지않아",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671911",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅇ？！"
			},
			{
				"my_post": "0",
				"icon_img": "img_-6642295_20221217101123.jpg",
				"nickname": "프라이드",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671912",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "설포",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13671913",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-623849_20221025015556.jpg",
				"nickname": "광삼123",
				"badge_use": "4320",
				"reply_img": "",
				"reply_seq": "13671914",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "설포",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13671915",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㄹㅇ ㅈㄴ웃기네 ㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_4405889_20221106151102.jpg",
				"nickname": "김덕배",
				"badge_use": "475",
				"reply_img": "",
				"reply_seq": "13671919",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3132020_20221026210704.jpg",
				"nickname": "동인남인서인북인",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671924",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅌㅌㅌㅌㅌㅌ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3633027_20221224215401.jpg",
				"nickname": "토네이도초코쿠키",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13671925",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-9253421_20221104012304.jpg",
				"nickname": "얼랭님",
				"badge_use": "265",
				"reply_img": "",
				"reply_seq": "13671938",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13671978",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13671988",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋ 개잘했다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1857142_20221215162840.jpg",
				"nickname": "더즌메렁",
				"badge_use": "214",
				"reply_img": "",
				"reply_seq": "13672011",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "zzzzzzzzzzz"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13673423",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "숭배합니다 Goat"
			},
			{
				"my_post": "0",
				"icon_img": "img_1397832_20221211094606.jpg",
				"nickname": "이슬3",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13673576",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "근데 이거 무슨뜻임？"
			},
			{
				"my_post": "0",
				"icon_img": "",
				"nickname": "시노다_우습네",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13673626",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_1978972_20221224210635.jpg",
				"nickname": "다정이",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13673657",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_8298953_20221207012841.jpg",
				"nickname": "기뮤",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13678607",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-10-28&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_-4453710_20221025003631.jpg",
		"pic_multi": "",
		"post_text": " \r\n",
		"views": 680,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(105166 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7769174",
		"icon_img": "img_3408720_20221224122142.jpg",
		"badge_use": "0",
		"post_title": "시발 개ㅈ됌ㅅ다",
		"nickname": "인공사(레알)",
		"post_date": "2022-05-04 17:01:25   ",
		"likes": 16,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13389777",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "시작됫다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1857142_20221215162840.jpg",
				"nickname": "더즌메렁",
				"badge_use": "214",
				"reply_img": "",
				"reply_seq": "13389793",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "극단적웃음주의자",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13389795",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "허허 웃으면서 마려우니까 싸죠 그랬는데 변기가 쩌적하고 금이 가부렸다"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13389800",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "ㅈ댓다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-2072309_20220312172208.jpg",
				"nickname": "뉴고졸백수",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13389811",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "이게 말이되나.."
			},
			{
				"my_post": "0",
				"icon_img": "img_-5774442_20220802163512.jpg",
				"nickname": "데굴베인",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13389842",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "세상에"
			},
			{
				"my_post": "0",
				"icon_img": "img_-8919624_20220717183037.jpg",
				"nickname": "머글",
				"badge_use": "130",
				"reply_img": "",
				"reply_seq": "13390144",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "이런 ㅆㅂ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3132020_20221026210704.jpg",
				"nickname": "seXxXxX",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13390567",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "흰수염의 부활이다"
			},
			{
				"my_post": "0",
				"icon_img": "",
				"nickname": "우선선",
				"badge_use": "161",
				"reply_img": "",
				"reply_seq": "13390800",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "ㄴㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㄴㅋㄴㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_2018703_20221203114027.jpg",
				"nickname": "매우살찐돼지",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13390841",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-04&lt;/font&gt;",
				"reply_title": "와"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13397334",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-08&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋ"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_7209136_20220504170126.jpg",
		"pic_multi": "",
		"post_text": "똥싸면서 흔들흔들했는데\r\n쩌억하고 금이 가부렸다</small></big></small></big></small></big></u></b></font></i><br><p><small><font size=1 color=#006699><b>[한마디]</b> 중요한 것은 꺾이지 않는 마음</small></big></font>",
		"views": 632,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(45605 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7759543",
		"icon_img": "img_2511566_20220523163447.jpg",
		"badge_use": "401",
		"post_title": "2022 유행어 등재 요청",
		"nickname": "극단적웃음주의자",
		"post_date": "2022-04-23 12:00:10   ",
		"likes": 16,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공사(레알)",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13371974",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-23&lt;/font&gt;",
				"reply_title": "사상최악의킬러다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-9253421_20221104012304.jpg",
				"nickname": "얼랭님",
				"badge_use": "265",
				"reply_img": "",
				"reply_seq": "13371975",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-23&lt;/font&gt;",
				"reply_title": "역시 메타선두자 키킥이다"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3714479_20221223011415.jpg",
				"nickname": "풉키푸키",
				"badge_use": "173",
				"reply_img": "",
				"reply_seq": "13371979",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-23&lt;/font&gt;",
				"reply_title": "헉 "
			},
			{
				"my_post": "0",
				"icon_img": "img_2018703_20221203114027.jpg",
				"nickname": "매우살찐돼지",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13371993",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-23&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13372279",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-23&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋz"
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "슬비빅",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13372680",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-24&lt;/font&gt;",
				"reply_title": "ㅈㄴ 멋있다"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13372931",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-24&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1857142_20221215162840.jpg",
				"nickname": "더즌메렁",
				"badge_use": "214",
				"reply_img": "",
				"reply_seq": "13373719",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-24&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "",
				"nickname": "진짤루에요",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13376064",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-25&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-1551738_20220112091856.jpg",
				"nickname": "이렐리아vv",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13377953",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-04-27&lt;/font&gt;",
				"reply_title": "키킥좌"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_3078014_20220423030011.jpg",
		"pic_multi": "",
		"post_text": "탱커, 딜러의 개념을 정면으로 박살내는\r\n킬러 포지션의 등장 ",
		"views": 561,
		"doodlrurls": "",
		"fixedpic": "img_-5905806_20221012154610.jpg",
		"stack": "(235268 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7948746",
		"icon_img": "img_-3809421_20221217134325.jpg",
		"badge_use": "4317",
		"post_title": "..",
		"nickname": "유동Vsss58P2",
		"post_date": "2022-12-12 16:32:52   ",
		"likes": 15,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_1397832_20221211094606.jpg",
				"nickname": "이슬3",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13733022",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_721074_20221224205202.jpg",
				"nickname": "안녕1",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13733024",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㄱ"
			},
			{
				"my_post": "0",
				"icon_img": "img_3610060_20221222231236.jpg",
				"nickname": "그런갑다",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13733028",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_3408720_20221224122142.jpg",
				"nickname": "인공샤샤샥",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13733029",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-3488732_20221029211151.jpg",
				"nickname": "모코땅",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13733030",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_8493250_20221224215507.jpg",
				"nickname": "바선생",
				"badge_use": "358",
				"reply_img": "",
				"reply_seq": "13733043",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㄱ "
			},
			{
				"my_post": "0",
				"icon_img": "",
				"nickname": "김참참",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13733247",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "1",
				"icon_img": "img_2511566_20220523163447.jpg",
				"nickname": "콘파고세구",
				"badge_use": "401",
				"reply_img": "",
				"reply_seq": "13733291",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "이씨벌럼"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5471063_20221030202900.jpg",
				"nickname": "상꺾샤싱",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13733401",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-5624346_20220903191625.jpg",
				"nickname": "넌무야",
				"badge_use": "217",
				"reply_img": "",
				"reply_seq": "13733481",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_1978972_20221224210635.jpg",
				"nickname": "다정이",
				"badge_use": "",
				"reply_img": "",
				"reply_seq": "13733524",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-12&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_1540773_20221204085445.jpg",
				"nickname": "콘파고",
				"badge_use": "4317",
				"reply_img": "",
				"reply_seq": "13734631",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-14&lt;/font&gt;",
				"reply_title": "ㅋㅋㅋㅋㅋ"
			},
			{
				"my_post": "0",
				"icon_img": "img_-7748309_20220525222647.jpg",
				"nickname": "자일호",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13739754",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-20&lt;/font&gt;",
				"reply_title": "ㅈㄴ 심술맞게 생겼네"
			},
			{
				"my_post": "0",
				"icon_img": "img_-7748309_20220525222647.jpg",
				"nickname": "자일호",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13739755",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-20&lt;/font&gt;",
				"reply_title": "초딩 때 여교사 노트북 배경화면 바퀴벌레로 바꾸거나"
			},
			{
				"my_post": "0",
				"icon_img": "img_-7748309_20220525222647.jpg",
				"nickname": "자일호",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13739756",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-20&lt;/font&gt;",
				"reply_title": "저학년애들 떡볶이 먹는데 흙뿌리고 도망가는 놈 있으면"
			},
			{
				"my_post": "0",
				"icon_img": "img_-7748309_20220525222647.jpg",
				"nickname": "자일호",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13739757",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-20&lt;/font&gt;",
				"reply_title": "십중팔구 저렇게 생긴 놈이었음"
			},
			{
				"my_post": "0",
				"icon_img": "img_-6642295_20221217101123.jpg",
				"nickname": "프라이드",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13740106",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-20&lt;/font&gt;",
				"reply_title": "자일호 고소합시다"
			},
			{
				"my_post": "0",
				"icon_img": "img_2389085_20221216145656.jpg",
				"nickname": "리무루",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13740174",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-12-20&lt;/font&gt;",
				"reply_title": "고소~~~하이 쳐즥이네！ ㅋㅋ"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "img_-7332510_20221212163252.jpg",
		"pic_multi": "",
		"post_text": " \r\n",
		"views": 825,
		"doodlrurls": "",
		"fixedpic": "img_1679955_20221212164447.jpg",
		"stack": "(1960 스택)",
		"isBookmarked": true
	},
	{
		"post_seq": "7789318",
		"icon_img": "img_-6642295_20221217101123.jpg",
		"badge_use": "0",
		"post_title": "2시간뒤 무시로글 예상",
		"nickname": "프라이드",
		"post_date": "2022-05-29 17:17:49   ",
		"likes": 15,
		"replys": [
			{
				"my_post": "0",
				"icon_img": "img_-6642295_20221217101123.jpg",
				"nickname": "프라이드",
				"badge_use": "0",
				"reply_img": "",
				"reply_seq": "13425656",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-29&lt;/font&gt;",
				"reply_title": "추천수뭐지？"
			},
			{
				"my_post": "0",
				"icon_img": "img_4405889_20221106151102.jpg",
				"nickname": "김덕배",
				"badge_use": "475",
				"reply_img": "",
				"reply_seq": "13425687",
				"android_id": "",
				"reply_date": "&lt;font color=#B2B2B2 size=1&gt;2022-05-29&lt;/font&gt;",
				"reply_title": "와...11추처음받아봐요감사합니다 ㅠㅠ"
			}
		],
		"youtube_url": "",
		"doodlr": "0",
		"pic_new": "",
		"pic_multi": "",
		"post_text": "글제목:msi 결승 같이보자해서 봤는데\r\n글내용:\r\n(좆같은여장남자짤한개투척후)\r\n진짜 t1졌다고 하루종일 징징대서 죽여버릴뻔\r\n</small></big></small></big></small></big></u></b></font></i><br><p><small><font size=1 color=#006699><b>[한마디]</b> uid 787578</small></big></font>",
		"views": 457,
		"doodlrurls": "",
		"fixedpic": "",
		"stack": "(47957 스택)",
		"isBookmarked": true
	}
]

/* 검색 - 명예의전당 클릭 */
function lol_onclick_search_award()
{
	event.stopPropagation()

	lol_lpanel_search_menu.style.display = 'none'
	g_lol_search_body = ''
	g_lol_search_nick = ''
	g_lol_search_vote = false
	g_lol_search_mine = false
	g_lol_is_award = true
	g_lol_spec_android_id = g_lol_android_id
	g_lol_is_bookmark = false // 이건 원래 롤백데이터 받아오는 곳에서 true로 처리해주는데, 여긴 오프라인이니까 추가. 근데 안 해도 됨

	g_lol_article_list = lol_award_articles_list
	lol_lpanel_update()
	lol_lpanel_refresh.style.height = '38px'
	lol_lpanel_search_menu.style.display = 'none'
	lol_lpanel_board.scroll(0, 0)
}

/* 왼쪽 글쓰기 버튼 클릭 */
function lol_onclick_write()
{
	lol_write_panel_toggle(true)
}

/* 내 정보 버튼 클릭 */
function lol_onclick_userinfo_button()
{
	if(g_lol_android_id == g_lol_guest_id)
	{
		lol_login_api_account()
		return
	}

	lol_lpanel_userinfo_menu.style.display = 'block'
}

/* 내 정보 메뉴 배경 클릭 */
function lol_onclick_userinfo_background() 
{
	lol_lpanel_userinfo_menu.style.display = 'none'
}

/* 내 정보 메뉴 내부 클릭 */
function lol_onclick_userinfo_foreground()
{
	event.stopPropagation()
}

/* 내 정보 - 닉네임 변경 클릭 */
// [v2] 롤백은 닉네임을 바꾸면 24시간 동안 다시 바꿀 수 없다 → 바꾸기 전에 알린다. 거부 사유는 index_socket.js 의 lol_change_nickname 에서 보여 준다
function lol_onclick_userinfo_nickname_change()
{
	event.stopPropagation()
	lol_lpanel_userinfo_menu.style.display = 'none'

	var current = g_lol_user_info && g_lol_user_info['nickname'] || ''
	if(!confirm('닉네임을 변경하시겠습니까?\n\n※ 한 번 변경하면 24시간 동안 다시 변경할 수 없습니다.'))
		return
	var input = prompt('새 닉네임을 입력하세요.\n(변경 후 24시간 동안 재변경 불가)', current)
	if(input == null) // 취소
		return
	var new_nick = input.trim()
	if(!new_nick)
		return alert('닉네임을 입력해 주세요.')
	if(new_nick == current)
		return alert('현재 닉네임과 같습니다.')

	socket.emit('lol_change_nickname', lol_add_api_auth({ user_id: g_lol_android_id, new_nick: new_nick }))
}

/* 내 정보 - 아이콘 변경 클릭 */
function lol_onclick_userinfo_icon_change()
{
	event.stopPropagation()
	lol_lpanel_userinfo_menu.style.display = 'none'
	lol_rpanel_show_icon_change_panel()
}

/* 내 정보 - 차단목록 클릭 (예전 '차단목록 초기화' 자리) */
function lol_onclick_userinfo_blocklist_reset()
{
	event.stopPropagation()
	lol_lpanel_userinfo_menu.style.display = 'none'
	lol_block_list_show()
}

/* 내 정보 - 롤디자게 로그아웃 클릭 */
// [v2] 예전 '쓰기 계정 로그아웃' 버튼과 합침: 롤백과사전 서버에서 이 기기의 로그인만 끝내고(all_devices: false)
// 브라우저에 저장된 계정 정보도 지운다. 서버 응답을 기다리지 않고 바로 게스트로 돌아간다.
var g_lol_logout_in_progress = false
function lol_onclick_userinfo_logout()
{
	var ans = confirm('롤디자게를 로그아웃 할까요?')
	if(!ans)
		return

	var auth = lol_get_api_auth()
	if(auth && auth.access_token)
	{
		g_lol_logout_in_progress = true
		socket.emit('lol_api_logout', { auth: auth })
	}

	lol_forget_api_credentials()
	g_lol_android_id = g_lol_guest_id
	g_lol_user_info = null
	lol_notif_reset() // [v2] 알림센터 배지·폴링 정리

	lol_lpanel_userinfo_menu.style.display = 'none'

	g_lol_panel_show = false
	lol_lpanel_board.scroll(0, 0)
	lol_panel_update()
}

/* 글 쓰기 - 취소 */
function lol_onclick_write_cancel() 
{

	if(lol_write_subject.value.length == 0 &&
		lol_write_body.value.length == 0 &&
		lol_write_youtube.value.length == 0 &&
		g_lol_write_images.length == 0)
	{
		lol_write_panel_toggle(false)
		return
	}

	var ans = confirm('취소 하시겠습니까?')
	if(!ans)
		return

	lol_write_subject.value = ''
	lol_write_body.value = ''
	lol_write_youtube.value = ''
	lol_write_images_clear()

	lol_write_panel_toggle(false)
}

/* 글 쓰기 - 등록 */
function lol_onclick_write_confirm() 
{
	if(lol_write_subject.value.length == 0)
		return

	if(lol_write_body.value.length == 0)
		return

	if(g_lol_write_images_busy)
		return alert('사진을 읽는 중입니다. 잠시 후 다시 등록해 주세요.')

	lol_request_api_credentials(function() {
		socket.emit('lol_write', lol_add_api_auth({
			android_id: g_lol_android_id,
			subject: lol_write_subject.value,
			body: lol_write_body.value,
			youtube_url: lol_write_youtube.value,
			// [v2] 사진 최대 10장, 배열 순서 = 글에 보이는 순서. GIF·WebP 는 원본 그대로 (캔버스 변환은 애니메이션을 없앤다)
			images: g_lol_write_images.map(function(item) { return { image: item.data, image_format: item.format } })
		}))
	})
}

/* 글 북마크 버튼 */
function lol_onclick_aritcle_bookmark()
{
	if(g_lol_current_detail.isBookmarked)
	{
		var ans = confirm('이 글의 북마크를 삭제하시겠습니까?')
		if(!ans)
			return
	}

	// 댓글이 아직 안 왔으면 빈 댓글로 보관한다
	var replys = g_lol_current_detail.replys || []
	var bookmark = Object.assign({}, g_lol_current_detail, { replys: replys, reply_cnt: replys.length })
	socket.emit('lol_bookmark', { android_id: g_lol_android_id, data: bookmark, isRegister: g_lol_current_detail.isBookmarked ? false : true})

	g_lol_current_detail.isBookmarked = !g_lol_current_detail.isBookmarked
	lol_rpanel_bookmark.style.backgroundImage = g_lol_current_detail.isBookmarked ? "url('static/star_full.png')" : "url('static/star_empty.png')"
	lol_rpanel_bookmark.toggleAttribute('bookmarked', Boolean(g_lol_current_detail.isBookmarked)) // [v2] 새 디자인 아이콘용
}

/* 글 새로고침 버튼 */
function lol_onclick_aritcle_refresh()
{
	lol_rpanel_refresh.style.display = 'none'
	lol_request_article_detail(g_lol_current_detail['post_seq'])
}

/* 글 내용 패널 업데이트 */
function lol_rpanel_update()
{
	var is_invalid = (!g_lol_current_detail || !('post_seq' in g_lol_current_detail) || !g_lol_current_detail['post_seq'].length)
	if(is_invalid)
	{
		g_lol_current_detail = {}
		g_lol_current_detail['post_title'] = '글이 존재하지 않습니다.'
		g_lol_current_detail['post_text'] = '글이 존재하지 않습니다.'
		g_lol_current_detail['nickname'] = '사용자'
		g_lol_current_detail['stack'] = '' // 없는 글에 "(0 스택)"이 뜨지 않게
		g_lol_current_detail['likes'] = '0'
		g_lol_current_detail['views'] = '0'
		g_lol_current_detail['post_date'] = '시간'
		g_lol_current_detail['youtube_url'] = ''
		g_lol_current_detail['badge_use'] = ''
		g_lol_current_detail['icon_img'] = ''
		g_lol_current_detail['pic_multi'] = ''
		g_lol_current_detail['doodlr'] = '0'
		g_lol_current_detail['pic_new'] = ''
		g_lol_current_detail['fixedpic'] = ''
		g_lol_current_detail['replys'] = []
	}

	lol_rpanel.removeAttribute('skeleton')

	// 헤더
	lol_rpanel_header_icon.src = lol_convert_uri_to_mirror(lol_get_icon_url(g_lol_current_detail['icon_img'], g_lol_current_detail['badge_use']))
	lol_rpanel_header_icon.onmouseenter = image_onmouseenter
	lol_rpanel_header_icon.onmouseout = image_onmouseout
	lol_rpanel_header_icon.onmousemove = image_onmousemove

	lol_rpanel_header_title.firstChild.nodeValue = g_lol_current_detail['post_title']
	lol_rpanel_header_nick.firstChild.nodeValue = g_lol_current_detail['nickname']
	lol_rpanel_header_spec.innerHTML = format('{0}조회 <b>{1}</b>', g_lol_current_detail['stack'] ? format('({0} 스택) ', g_lol_current_detail['stack']) : '', g_lol_current_detail['views'])

	lol_rpanel_header_memo_button.style.display = 'block'
	lol_rpanel_header_memo_body.style.display = 'none'
	lol_rpanel_header_memo_edit.style.display = 'none'

	if(g_lol_android_id == g_lol_guest_id)
	{
		lol_rpanel_header_button.firstChild.nodeValue = '[롤백과사전 로그인하기]'
		lol_rpanel_header_button.style.display = ''
		lol_rpanel_header_memo_container.style.display = 'none'
	}
	else
	{
		lol_rpanel_header_button.innerHTML = '[차단하기]'
		// [v2] 없는 글·내 글에서는 차단 버튼을 감춘다
		lol_rpanel_header_button.style.display = (is_invalid || g_lol_current_detail['my_post'] == '1') ? 'none' : ''
		lol_rpanel_header_memo_container.style.display = is_invalid ? 'none' : 'flex'
	}

	lol_rpanel_bookmark.style.display = is_invalid ? 'none' : 'block'
	lol_rpanel_bookmark.style.backgroundImage = g_lol_current_detail.isBookmarked ? "url('static/star_full.png')" : "url('static/star_empty.png')"
	lol_rpanel_bookmark.toggleAttribute('bookmarked', Boolean(g_lol_current_detail.isBookmarked)) // [v2] 새 디자인 아이콘용

	// 영상
	if(!g_lol_same_article_prev)
	{
		if(g_lol_current_detail['youtube_url'].length > 0)
		{
			lol_rpanel_body_youtube_container.style.display = 'block'
			iframe_set_src(lol_rpanel_body_youtube_player, format('https://www.youtube.com/embed/{0}', youtube_url_parse(g_lol_current_detail['youtube_url'])))
		}
		else
		{
			lol_rpanel_body_youtube_container.style.display = 'none'
			iframe_set_src(lol_rpanel_body_youtube_player, '')
		}
	}

	// 사진
	var zzals = []
	if(Array.isArray(g_lol_current_detail['image_urls']) && g_lol_current_detail['image_urls'].length)
	{
		zzals = g_lol_current_detail['image_urls']
	}
	else if(g_lol_current_detail['pic_multi'].length)
	{
		zzals = g_lol_current_detail['pic_multi'].split('/').filter(e => e.length).map(e => format('http://lolwiki.kr/freeboard/uploads/files/{0}/{1}', lol_get_date_from_filename(e), e))
	}
	else if(g_lol_current_detail['pic_new'].length)
	{
		zzals = [format('http://lolwiki.kr/freeboard/uploads/files/{0}/{1}', lol_get_date_from_filename(g_lol_current_detail['pic_new']), g_lol_current_detail['pic_new'])]
	}
	else if(g_lol_current_detail['doodlr'] > 0)
	{
		var filename = g_lol_current_detail['doodlrurls'].substr(0, g_lol_current_detail['doodlrurls'].length - 1)
		zzals = filename.split('/').map(x => format('http://lolwiki.kr/freeboard/uploads/doodlr/{0}/{1}', lol_get_date_from_filename(x), x))
	}
	else if(g_lol_current_detail['fixedpic'] && g_lol_current_detail['fixedpic'].length)
	{
		zzals = [format('http://lolwiki.kr/freeboard/uploads/fixed_img/files/{0}/{1}', lol_get_date_from_filename(g_lol_current_detail['fixedpic']), g_lol_current_detail['fixedpic'])]
	}

	lol_rpanel_body_img1_img.src = ''
	lol_rpanel_body_img2_img.src = ''
	lol_rpanel_body_img3_img.src = ''
	lol_rpanel_body_img4_img.src = ''
	lol_rpanel_body_img1_add.setAttribute('src', '')
	lol_rpanel_body_img2_add.setAttribute('src', '')
	lol_rpanel_body_img3_add.setAttribute('src', '')
	lol_rpanel_body_img4_add.setAttribute('src', '')
	if(zzals.length > 0)
	{
		lol_rpanel_body_img1.style.display = 'block'
		lol_rpanel_body_img1_img.src = lol_convert_uri_to_mirror(zzals[0])
		lol_rpanel_body_img1_add.setAttribute('src', zzals[0])
	}
	else
		lol_rpanel_body_img1.style.display = 'none'

	if(zzals.length > 1)
	{
		lol_rpanel_body_img2.style.display = 'block'
		lol_rpanel_body_img2_img.src = lol_convert_uri_to_mirror(zzals[1])
		lol_rpanel_body_img2_add.setAttribute('src', zzals[1])
	}
	else
		lol_rpanel_body_img2.style.display = 'none'

	if(zzals.length > 2)
	{
		lol_rpanel_body_img3.style.display = 'block'
		lol_rpanel_body_img3_img.src = lol_convert_uri_to_mirror(zzals[2])
		lol_rpanel_body_img3_add.setAttribute('src', zzals[2])
	}
	else
		lol_rpanel_body_img3.style.display = 'none'

	if(zzals.length > 3)
	{
		lol_rpanel_body_img4.style.display = 'block'
		lol_rpanel_body_img4_img.src = lol_convert_uri_to_mirror(zzals[3])
		lol_rpanel_body_img4_add.setAttribute('src', zzals[3])
	}
	else
		lol_rpanel_body_img4.style.display = 'none'
	lol_rpanel_update_extra_images(zzals.slice(4)) // [v2] 5번째부터 (앱은 10장까지 올린다)

	if(!g_lol_same_article_prev)
	{
		lol_rpanel_body_img1.toggleAttribute('small', true)
		lol_rpanel_body_img2.toggleAttribute('small', true)
		lol_rpanel_body_img3.toggleAttribute('small', true)
		lol_rpanel_body_img4.toggleAttribute('small', true)
	}

	// 아이콘 변경 전용 엘리먼트 숨기기
	lol_rpanel_body_icon_change_placeholder.style.display = 'none'
	lol_rpanel_body_icon_change_canvas_container.style.display = 'none'
	lol_rpanel_body_icon_change_size_slider.style.display = 'none'
	lol_icon_change_buttons.style.display = 'none'
	
	// [v2] 신 API 는 줄바꿈을 LF 로 내려준다 → CRLF 만 바꾸면 여러 줄 글이 한 줄로 붙는다. <br>·<font> 가 박힌 옛 글에는 단독 LF 가 없어 영향 없음
	lol_rpanel_body_body.innerHTML = lol_nl_to_br(g_lol_current_detail['post_text'].replace('size=1', '')).replace(/？/g, '?').replace(/＆/g, '&')
	document.querySelectorAll('#lol_rpanel_body_body > [src]').forEach( e => {
		var div = document.createElement('div')
		div.classList.add('lol_rpanel_img_body')
		div.toggleAttribute('small', true)
		e.parentNode.insertBefore(div, e)

		var img = document.createElement('img')
		img.src = lol_convert_uri_to_mirror(e.getAttribute('src'))
		img.style.width = '100%'
		img.classList.add('lol_rpanel_img_img')
		div.appendChild(img)

		var div_add = document.createElement('div')
		div_add.classList.add('lol_rpanel_img_add')
		div.appendChild(div_add)

		div.onclick = lol_onclick_img
		div_add.onclick = lol_onclick_img_add
		div_add.setAttribute('src', e.getAttribute('src'))

		e.remove()
	})
	lol_set_time(lol_rpanel_body_date, g_lol_current_detail['post_date'])

	// 추천
	if(!is_invalid)
		lol_rpanel_body_like.style.display = 'block'
	else
		lol_rpanel_body_like.style.display = 'none'
	lol_rpanel_body_like_count.firstChild.nodeValue = g_lol_current_detail['likes']
	lol_rpanel_update_vote(is_invalid) // [v2] 내 표 상태 강조·비추천 버튼

	// 삭제 버튼
	if(is_invalid || g_lol_current_detail['my_post'] != '1')
		lol_rpanel_body_delete_button.style.display = 'none'
	else
		lol_rpanel_body_delete_button.style.display = 'block'

	// 공유 버튼
	if(!is_invalid)
		lol_rpanel_body_share_button.style.display = 'block'
	else
		lol_rpanel_body_share_button.style.display = 'none'
	lol_rpanel_body_share_button.setAttribute('icon_img', lol_get_icon_url(g_lol_current_detail['icon_img'], g_lol_current_detail['badge_use']))
	lol_rpanel_body_share_button.setAttribute('post_title', g_lol_current_detail['post_title'])
	lol_rpanel_body_share_button.setAttribute('post_spec', format('{0} | 조회 {1} | 추천 {2}', g_lol_current_detail['nickname'], g_lol_current_detail['views'], g_lol_current_detail['likes']))
	lol_rpanel_body_share_button.setAttribute('post_seq',  g_lol_current_detail['post_seq'])

	// 댓글
	lol_rpanel_update_replys()

	// 댓글 작성칸
	if(g_lol_android_id != g_lol_guest_id && !is_invalid)
	{
		lol_rpanel_reply_board_write_container.style.display = 'flex'
	}
	else
	{
		lol_rpanel_reply_board_write_container.style.display = 'none'
	}

	if(g_lol_rpanel_scroll_top_switch)
	{
		g_lol_rpanel_scroll_top_switch = false
		lol_rpanel_body.scroll(0, 0)
	}
}

/* 댓글 목록 업데이트. 댓글이 아직 안 왔으면(null) 자리표시를 보여 준다 */
function lol_rpanel_update_replys()
{
	var replys = g_lol_current_detail['replys']
	lol_rpanel_reply_board.toggleAttribute('skeleton', !replys)

	// [v2] 답글 입력창이 목록 안(대상 댓글 아래)에 있으면 목록을 비울 때 같이 지워지므로 먼저 제자리로
	lol_reply_target_detach()

	// 모든 자식 노드 삭제
	while ( lol_rpanel_reply_board_list.hasChildNodes() )
		lol_rpanel_reply_board_list.removeChild( lol_rpanel_reply_board_list.firstChild )

	if(!replys)
		return

	lol_rpanel_body_share_button.setAttribute('post_reply', replys.length)

	if(replys.failed)
	{
		var div = document.createElement('div')
		div.classList.add('lol_reply_list_item')
		div.appendChild(document.createTextNode('댓글을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.'))
		lol_rpanel_reply_board_list.appendChild(div)
		return
	}

	// [v2] '@닉네임' 강조용: 글 작성자와 댓글 작성자 (공백이 든 닉네임도 통째로 잡기 위해)
	var mention_nicks = [g_lol_current_detail['nickname']].concat(replys.map(function(r) { return r && r['nickname'] }))

	for(var e of lol_thread_replies(replys)) // [v2] 답글은 부모 댓글 아래에
	{
		var div = document.createElement('div')
		div.classList.add('lol_reply_list_item')
		div.setAttribute('seq', e['reply_seq'])
		div.setAttribute('depth', Math.min(e.depth || 0, 4)) // [v2] 답글 들여쓰기 (CSS)
		
		// 아이콘
		var img = document.createElement('img')
		img.toggleAttribute('icon', true)
		img.src = lol_convert_uri_to_mirror(lol_get_icon_url(e['icon_img'], e['badge_use']))
		img.onmouseenter = image_onmouseenter
		img.onmouseout = image_onmouseout
		img.onmousemove = image_onmousemove
		div.appendChild(img)

		var reply_body = document.createElement('div')
		reply_body.toggleAttribute('reply_body')

		// 닉/시간/삭제버튼
		var nick_container = document.createElement('div')
		nick_container.toggleAttribute('nick_container', true)

		var nick = document.createElement('div')
		nick.toggleAttribute('nick', true)
		nick.appendChild(document.createTextNode(e['nickname']))
		nick_container.appendChild(nick)

		var before = document.createElement('div')
		before.toggleAttribute('before', true)
		lol_set_time(before, e['reply_date'], e['reply_date'] // 시각이 아니면(예전 HTML 표기) 그대로
							.replace(' size=1', '')
							.replace(/&lt;/g, '<')
							.replace(/&gt;/g, '>')
							.replace('</font>', '</b></font>'))
		nick_container.appendChild(before)

		if(e['my_post'] == 1)
		{
			var del = document.createElement('div')
			del.toggleAttribute('del', true)
			del.setAttribute('seq', e['reply_seq'])
			del.onclick = lol_onclick_delete_reply
			del.classList.add('no-drag')
			del.appendChild(document.createTextNode('[삭제]'))
			nick_container.appendChild(del)
		}

		// [v2] 답글 버튼 (로그인했을 때만)
		if(g_lol_android_id != g_lol_guest_id)
		{
			var reply_btn = document.createElement('div')
			reply_btn.toggleAttribute('reply_btn', true)
			reply_btn.classList.add('no-drag')
			reply_btn.setAttribute('seq', e['reply_seq'])
			reply_btn.setAttribute('nick', e['nickname'] || '')
			reply_btn.textContent = '답글'
			reply_btn.onclick = lol_onclick_reply_target
			nick_container.appendChild(reply_btn)
		}

		reply_body.appendChild(nick_container)

		// 댓글이미지
		var reply_image_url = e['image_url'] || (e['reply_img'] && e['reply_img'].length > 0
			? format('http://lolwiki.kr/freeboard/uploads/files/{0}/{1}', lol_get_date_from_filename(e['reply_img']), e['reply_img'])
			: '')
		if(reply_image_url)
		{
			var img = document.createElement('img')
			img.toggleAttribute('img', true)
			img.toggleAttribute('small', true)
			img.src = lol_convert_uri_to_mirror(reply_image_url)
			img.onclick = lol_onclick_reply_img
			reply_body.appendChild(img)
		}

		var text = document.createElement('div')
		text.toggleAttribute('text', true)
		text.innerHTML = lol_nl_to_br(lol_decorate_mentions(e['reply_title'], mention_nicks)) // [v2] '@닉네임' 강조 뒤에 줄바꿈을 <br> 로 (순서가 바뀌면 줄 첫머리 @ 를 놓친다)
		// text.appendChild(document.createTextNode(e['reply_title']))
		reply_body.appendChild(text)

		div.appendChild(reply_body)

		lol_rpanel_reply_board_list.appendChild(div)
	}

	lol_reply_target_attach() // [v2] 답글 대상이 있으면 입력창을 그 댓글 아래로
}

/* 아이콘 변경 창 열기 */
function lol_rpanel_show_icon_change_panel()
{
	lol_mobile_show_detail(true)

	lol_cancel_article_loading()

	// 아이콘
	lol_rpanel_header_icon.src = ''
	lol_rpanel_header_icon.onmouseenter = image_onmouseenter
	lol_rpanel_header_icon.onmouseout = image_onmouseout
	lol_rpanel_header_icon.onmousemove = image_onmousemove

	// 글 헤더
	lol_rpanel_header_title.firstChild.nodeValue = "아이콘 제작 테스트"
	lol_rpanel_header_nick.firstChild.nodeValue = g_lol_user_info['nickname']
	lol_rpanel_header_spec.innerHTML = format('({0} 스택) 조회 <b>{1}</b>', g_lol_user_info['point'], 123)

	lol_rpanel_header_button.innerHTML = '[아이콘 테스트 중]'


	// 글 내용
	lol_rpanel_body_youtube_container.style.display = 'none'
	iframe_set_src(lol_rpanel_body_youtube_player, '')

	lol_rpanel_body_img1_img.src = ''
	lol_rpanel_body_img2_img.src = ''
	lol_rpanel_body_img3_img.src = ''
	lol_rpanel_body_img4_img.src = ''
	lol_rpanel_body_img1_add.setAttribute('src', '')
	lol_rpanel_body_img2_add.setAttribute('src', '')
	lol_rpanel_body_img3_add.setAttribute('src', '')
	lol_rpanel_body_img4_add.setAttribute('src', '')
	lol_rpanel_body_img1.style.display = 'none'
	lol_rpanel_body_img2.style.display = 'none'
	lol_rpanel_body_img3.style.display = 'none'
	lol_rpanel_body_img4.style.display = 'none'

	// 아이콘 변경 전용 엘리먼트 표시
	var has_no_image = !g_lol_icon_change_has_image
	lol_rpanel_body_icon_change_placeholder.style.display = has_no_image ? 'block' : 'none'
	lol_rpanel_body_icon_change_canvas_container.style.display = has_no_image ? 'none' : 'block'
	lol_rpanel_body_icon_change_size_slider.style.display = has_no_image ? 'none' : 'block'
	lol_icon_change_buttons.style.display = 'flex'

	lol_rpanel_body_body.innerHTML = "아래의 등록을 누르면 아이콘이 변경됩니다.<br/>취소버튼을 누르면 이미지를 다시 설정할 수 있습니다."
	lol_set_time(lol_rpanel_body_date, "1996-03-15 01:33:00")

	lol_rpanel_body_like.style.display = 'none'
	lol_rpanel_body_dislike.style.display = 'none'
	lol_rpanel_body_like_count.firstChild.nodeValue = '0'

	lol_rpanel_body_delete_button.style.display = 'none'
	lol_rpanel_body_share_button.style.display = 'none'

	// 댓글
	// 모든 자식 노드 삭제
	while ( lol_rpanel_reply_board_list.hasChildNodes() ) 
		lol_rpanel_reply_board_list.removeChild( lol_rpanel_reply_board_list.firstChild )

	var sample_replys = [{
		nickname: g_lol_user_info['nickname'],
		reply_date: '<font color=#903C39><b>3분전</b></font>',
		reply_title: '아이콘 테스트 댓글입니다'
	}]

	for(var e of sample_replys)
	{
		var div = document.createElement('div')
		div.classList.add('lol_reply_list_item')

		// 아이콘
		var img = document.createElement('img')
		img.toggleAttribute('icon', true)
		img.src = ''
		img.onmouseenter = image_onmouseenter
		img.onmouseout = image_onmouseout
		img.onmousemove = image_onmousemove
		div.appendChild(img)

		g_lol_icon_change_reply_icon_element = img

		var reply_body = document.createElement('div')
		reply_body.toggleAttribute('reply_body')

		// 닉/시간/삭제버튼
		var nick_container = document.createElement('div')
		nick_container.toggleAttribute('nick_container', true)

		var nick = document.createElement('div')
		nick.toggleAttribute('nick', true)
		nick.appendChild(document.createTextNode(e['nickname']))
		nick_container.appendChild(nick)

		var before = document.createElement('div')
		before.toggleAttribute('before', true)
		before.innerHTML = e['reply_date']
		nick_container.appendChild(before)

		reply_body.appendChild(nick_container)

		var text = document.createElement('div')
		text.toggleAttribute('text', true)
		text.innerHTML = e['reply_title']
		// text.appendChild(document.createTextNode(e['reply_title']))
		reply_body.appendChild(text)

		div.appendChild(reply_body)

		lol_rpanel_reply_board_list.appendChild(div)

		lol_rpanel_reply_board_write_container.style.display = 'none'

		g_lol_rpanel_scroll_top_switch = false
		lol_rpanel_body.scroll(0, 0)
	}
}

/* 댓글 이미지 클릭 (줌인, 줌아웃) */
function lol_onclick_reply_img()
{
	var element = event.currentTarget
	element.toggleAttribute('small')
}

/* 추천 버튼 (이미 추천한 글이면 서버가 취소로 처리한다) */
function lol_onclick_like()
{
	if(g_lol_android_id == g_lol_guest_id || !g_lol_current_detail || !g_lol_current_detail['post_seq'])
		return

	socket.emit('lol_like', lol_add_api_auth({ post_seq: g_lol_current_detail['post_seq'], android_id: g_lol_android_id, action: 'up' }))
}

/* [v2] 비추천 버튼. 추천 0인 글은 비추천 불가, 내가 비추천한 글은 다시 눌러 취소 (롤백 앱 규칙) */
function lol_onclick_dislike()
{
	event.stopPropagation()
	if(g_lol_android_id == g_lol_guest_id || !g_lol_current_detail || !g_lol_current_detail['post_seq'])
		return
	if(lol_rpanel_body_dislike.hasAttribute('disabled'))
		return

	socket.emit('lol_like', lol_add_api_auth({ post_seq: g_lol_current_detail['post_seq'], android_id: g_lol_android_id, action: 'down' }))
}

/* [v2] 추천·비추천 표시 갱신: 내가 추천한 글은 추천 그래픽을 강조하고, 비추천 버튼의 표시·활성 상태를 맞춘다.
   is_hidden: 글이 없을 때(없는 글, 아이콘 제작 화면). 게스트에게는 비추천 버튼을 보이지 않는다 */
function lol_rpanel_update_vote(is_hidden)
{
	var vote = g_lol_current_detail && g_lol_current_detail['my_vote'] || 'neutral'
	var likes = Number(g_lol_current_detail && g_lol_current_detail['likes']) || 0
	lol_rpanel_body_like_count.firstChild.nodeValue = String(likes)
	lol_rpanel_body_like.toggleAttribute('voted', vote == 'up')
	lol_rpanel_body_dislike.style.display = is_hidden || g_lol_android_id == g_lol_guest_id ? 'none' : 'block'
	lol_rpanel_body_dislike.toggleAttribute('voted', vote == 'down')
	lol_rpanel_body_dislike.toggleAttribute('disabled', likes <= 0 && vote != 'down')
}

/* [v2] 작성자 id 가 내 식별자(local_user_key·legacy_id·android_id…) 중 하나면 내 글 */
function lol_is_my_content(author_id)
{
	if(!author_id || !g_lol_user_info)
		return false
	var keys = ['local_user_key', 'user_key', 'id', 'legacy_id', 'legacy_android_id', 'legacy_device_id', 'android_id']
	return keys.some(function(key) { return g_lol_user_info[key] != null && String(g_lol_user_info[key]) == String(author_id) })
}

/* [v2] 줄바꿈(LF·CR·CRLF)을 <br> 로. 멱등이라 여러 번 불러도 안전 */
function lol_nl_to_br(text)
{
	return String(text == null ? '' : text).replace(/\r\n|\r|\n/g, '<br>')
}

/* [v2] 캔버스로 바꾸면 애니메이션이 사라지는 형식 → 원본 바이트를 그대로 올린다 (글·댓글 첨부 공통) */
var g_lol_keep_original_formats = { 'image/gif': 'gif', 'image/webp': 'webp' }

/* 글 이미지 클릭 (줌인, 줌아웃) */
function lol_onclick_img()
{
	var element = event.currentTarget
	element.toggleAttribute('small')
}

/* 글 이미지 채팅에 첨부 클릭 */
function lol_onclick_img_add()
{
	event.stopPropagation()

	if(!g_nick)
		return

	var element = event.currentTarget
	var img_src = element.getAttribute('src')

	socket.emit('chat_message', { type: 'message', message: format('/img {0}', img_src), tts_hash: '' })
}

/* 작성자의 작성글 보기 */
function lol_onrclick_article_writer()
{
	event.preventDefault()
	if(document.documentElement.hasAttribute('lol_compact')) // [v2] 컴팩트 모드: 목록이 바뀌니 목록으로
		lol_onclick_rpanel_back()

	socket.emit('lol_get_article_list_others', g_lol_current_detail.post_seq)
}

function lol_onclick_show_user_memo()
{
	event.preventDefault()
	event.stopPropagation()

	if(g_lol_android_id == g_lol_guest_id)
		return

	if(g_lol_current_detail.post_seq == null)
		return

	lol_rpanel_header_memo_button.style.display = 'none'
	socket.emit('lol_query_article_writer_android_id', { android_id: g_lol_android_id, post_seq: g_lol_current_detail.post_seq })
}

function lol_onclick_edit_user_memo()
{
	event.preventDefault()
	event.stopPropagation()

	if(g_lol_android_id == g_lol_guest_id)
		return

	if(g_lol_current_detail.post_seq == null)
		return

	var ans = prompt('유저 메모를 입력하세요.')
	if(ans === null) // 취소
		return

	lol_rpanel_header_memo_body.firstChild.nodeValue = ans
	socket.emit('lol_update_user_memo', { android_id: g_lol_android_id, post_seq: g_lol_current_detail.post_seq, memo: ans })
}

/* 이 계정에 로그인하기 버튼 또는 차단버튼 */
// [v2] 차단: 작성자의 글·댓글이 보이지 않게 된다. 목록은 롤백 앱의 '내 정보 → 차단 관리'와 같다 (해제는 내 정보 → 차단목록)
function lol_onclick_auth_or_block()
{
	if(g_lol_android_id == g_lol_guest_id)
	{
		lol_login_api_account()
		return
	}
	if(!g_lol_current_detail || !g_lol_current_detail['post_seq'])
		return
	if(g_lol_current_detail['my_post'] == '1')
		return alert('자신은 차단할 수 없습니다.')

	var nick = g_lol_current_detail['nickname'] || '이 사용자'
	if(!confirm(nick + ' 님을 차단하시겠습니까?\n차단한 사용자의 글과 댓글은 보이지 않습니다.'))
		return
	socket.emit('lol_block_user', lol_add_api_auth({ post_seq: g_lol_current_detail['post_seq'] }))
}

/* 이 계정에 로그인하기 버튼 또는 차단버튼 우클릭 */
function lol_onrclick_auth_or_block()
{
	// event.stopPropagation()
	
	// g_lol_search_body = ''
	// g_lol_search_mine = true
	// g_lol_search_nick = ''
	// g_lol_search_vote = false
	// g_lol_article_scroll_seq = 0
	// g_lol_article_list = []

}


/* 이 유튜브 영상을 대기열에 바로 추가 버튼 */
function lol_onclick_youtube_instant_queue()
{
	socket.emit('queue', {dj: g_nick, video_id: youtube_url_parse(g_lol_current_detail['youtube_url'])})
}

/* 글 삭제 버튼 */
function lol_onclick_delete()
{
	if(g_lol_android_id == g_lol_guest_id)
		return

	var yes = confirm('이 글을 삭제하시겠습니까?')
	if(!yes)
		return

	socket.emit('lol_delete', lol_add_api_auth({ android_id: g_lol_android_id, post_seq: g_lol_current_detail['post_seq'] }))
}

/* 글 공유 버튼 */
function lol_onclick_share()
{
	if(!g_nick)
		return

	var icon_img = lol_rpanel_body_share_button.getAttribute('icon_img') 
	var post_title = lol_rpanel_body_share_button.getAttribute('post_title')
	var post_reply = lol_rpanel_body_share_button.getAttribute('post_reply')
	var post_spec = lol_rpanel_body_share_button.getAttribute('post_spec')
	var post_seq = lol_rpanel_body_share_button.getAttribute('post_seq')
	
	socket.emit('chat_message', { type: 'message', message: '롤백 링크를 공유했습니다.', tts_hash: '', 
		lol_link_data: { 
			icon_img: icon_img,
			post_title: post_title,
			post_reply: post_reply,
			post_spec: post_spec,
			post_seq: post_seq
		} })
}

/* 댓글 엔터 쇼트컷 이벤트 */
function lol_onkeydown_reply()
{
	if (event.keyCode == 13)
		lol_write_reply()
}

/* 댓글 등록 버튼 이벤트 */
function lol_onclick_reply_send()
{
	lol_write_reply()
}

/* 댓글 쓰기 - 클립보드로부터 이미지 첨부 */
function lol_rpanel_reply_board_write_image_onpaste()
{
	var pasteObj = (event.clipboardData || window.clipboardData); 
	var blob = pasteObj.files[0]
	if(!blob)
	{
		console.log('이미지 첨부 실패: 클립보드 내용이 이미지가 아니다..')
		return
	}
	g_lol_write_reply_image_data_orig = ''
	g_lol_write_reply_image_format = ''
	var reader = new FileReader()
	reader.onload = function(ev) { 
		var ret = ev.target.result
		if(g_lol_keep_original_formats[blob.type]) // [v2] GIF·WebP 는 원본을 보관해 두었다가 그대로 올린다
		{
			g_lol_write_reply_image_data_orig = ret.substring(ret.indexOf(',') + 1)
			g_lol_write_reply_image_format = g_lol_keep_original_formats[blob.type]
		}
		lol_rpanel_reply_board_write_image_placeholder.style.display = 'none'
		lol_rpanel_reply_board_write_image.src = ret
		lol_rpanel_reply_board_write_image.style.display = 'block'
		lol_rpanel_reply_board_write_image_guide.innerHTML = '이미지 첨부 중... 기다려주셈'
		lol_rpanel_reply_board_write_image_guide.style.display = 'block'
	}
	reader.readAsDataURL(blob)
}

/* 댓글 쓰기 - 이미지 첨부란 불필요한 문자 입력 시 제거 처리 */
function lol_rpanel_reply_board_write_image_clear_text()
{
	lol_rpanel_reply_board_write_image_placeholder.value = ''
}

/* 댓글 쓰기 - 이미지 첨부 제거 */
function lol_clear_reply_image()
{
	g_lol_write_reply_image_data = ''
	g_lol_write_reply_image_data_orig = ''
	g_lol_write_reply_image_format = ''
	lol_rpanel_reply_board_write_image.style.display = 'none'
	lol_rpanel_reply_board_write_image_guide.style.display = 'none'
	lol_rpanel_reply_board_write_image.src = ''
	lol_rpanel_reply_board_write_image_placeholder.style.display = 'block'
}

/* 댓글 쓰기 - 이미지 로딩 완료 이벤트 */
function lol_rpanel_reply_board_write_image_onload()
{
	lol_rpanel_reply_board_write_canvas.width = lol_rpanel_reply_board_write_image.naturalWidth
	lol_rpanel_reply_board_write_canvas.height = lol_rpanel_reply_board_write_image.naturalHeight
	lol_rpanel_reply_board_write_canvas.getContext('2d').drawImage(lol_rpanel_reply_board_write_image, 0,0)
	g_lol_write_reply_image_data = (lol_rpanel_reply_board_write_canvas.toDataURL("image/jpeg").substr(23))
	lol_rpanel_reply_board_write_image_guide.innerHTML = '이미지가 첨부 되었습니다.'
}

/* 댓글 삭제 버튼 이벤트 */
function lol_onclick_delete_reply()
{
	var element = event.currentTarget
	var reply_seq = element.getAttribute('seq')
	var post_seq = g_lol_current_detail['post_seq']
	
	socket.emit('lol_delete_reply', lol_add_api_auth({ android_id: g_lol_android_id, post_seq: post_seq, reply_seq: reply_seq }))
}


/* 댓글 쓰기 */
function lol_write_reply()
{
	if(lol_rpanel_reply_board_input.value.length == 0)
		return

	if(g_lol_android_id == g_lol_guest_id)
		return

	var body = lol_rpanel_reply_board_input.value
	var parent_id = 0
	if(g_lol_reply_target) // [v2] 답글: 부모 댓글 번호와 '@닉네임 ' 을 붙인다
	{
		parent_id = g_lol_reply_target.seq
		var tag = '@' + g_lol_reply_target.nick + ' '
		if(g_lol_reply_target.nick && !body.startsWith(tag))
			body = tag + body
	}

	lol_request_api_credentials(function() {
		socket.emit('lol_write_reply', lol_add_api_auth({
			android_id: g_lol_android_id,
			post_seq: g_lol_current_detail['post_seq'],
			body: body,
			parent_id: parent_id,
			image: g_lol_write_reply_image_data_orig || g_lol_write_reply_image_data,
			image_format: g_lol_write_reply_image_format || 'jpg' // [v2] GIF·WebP 는 원본 그대로
		}))
		lol_clear_reply_image()
	})
}

/* UI 업뎃 */
function lol_panel_update()
{
	if(g_lol_panel_show)
	{
		lol_panel.style.display = 'flex'
		if(g_lol_android_id == g_lol_guest_id)
			lol_lpanel_write_button.style.display = 'none'
	}
	else
	{
		lol_panel.style.display = 'none'
	}
	document.documentElement.toggleAttribute('lol_board_open', g_lol_panel_show) // [v2] 컴팩트 모드: 열려 있으면 영상을 옆으로 (CSS)

	mobile_tab_sync()
}

/* [v2] 롤백 컴팩트 모드 (옵션 > 화면): 글목록과 글상세를 한 칸으로 합치고 영상을 그 옆에 둔다 (index.css :root[lol_compact]).
   목록↔상세 전환은 모바일 레이아웃과 같은 #lol_panel[mobile_detail] 을 그대로 쓴다. 모바일 조건에서는 모바일 레이아웃이 우선 */
function set_lol_compact(on)
{
	document.documentElement.toggleAttribute('lol_compact', Boolean(on) && !g_mobile_media.matches)
}

/* 글 쓰기 패널 토글 */
function lol_write_panel_toggle(isShow)
{
	// 모바일: 글쓰기를 열면 상세 화면으로, 글쓰기를 닫으면(취소·등록) 글목록으로
	if(isShow)
		lol_mobile_show_detail(true)
	else if(lol_write.style.display == 'flex')
		lol_mobile_show_detail(false)

	if(isShow)
	{
		lol_rpanel.style.display = 'none'
		lol_write.style.display = 'flex'
	}
	else
	{
		lol_rpanel.style.display = '' // 데스크톱은 block, 모바일은 CSS의 flex
		lol_write.style.display = 'none'
	}
}

/* 모바일: 글목록과 글상세(글쓰기 포함) 중 하나만 보여준다. 데스크톱은 둘 다 보이므로 CSS에서 무시된다 */
function lol_mobile_show_detail(isDetail)
{
	lol_panel.toggleAttribute('mobile_detail', isDetail)

	// 폰의 뒤로가기 버튼으로 글목록에 돌아올 수 있게 히스토리 한 칸 쌓기 (이미 쌓여 있으면 그대로).
	// 상세가 이미 떠 있어도 기록 칸이 없으면 쌓는다
	if(isDetail && g_mobile_media.matches && !(history.state && history.state.lol_detail))
		history.pushState({ lol_detail: true }, '')
}

/* 모바일 글상세 ← 버튼 */
function lol_onclick_rpanel_back()
{
	// 화면은 바로 글목록으로 돌린다. 기록 이동만 믿으면 그 이동이 화면에 안 닿을 때 버튼이 먹통이 된다
	lol_mobile_show_detail(false)

	// 상세를 열 때 쌓은 기록 칸은 지워서, 다음 폰 뒤로가기가 헛돌지 않게 한다 (뒤따르는 popstate는 이미 글목록이라 그냥 지나간다)
	if(history.state && history.state.lol_detail)
		history.back()
}

window.addEventListener('popstate', _ => lol_mobile_show_detail(false))

/* ========== [v2] 글 쓰기 - 사진 여러 장 첨부 (최대 10장) ==========
   붙여넣기(Ctrl+V)/파일 드롭 칸에 넣으면 타일로 쌓이고, 타일을 끌어다 놓으면 글에 보이는 순서가 바뀐다 (a,b,c,d → a,d,b,c).
   GIF·WebP 는 원본 바이트 그대로(애니메이션 유지), 그 외는 예전처럼 JPEG 로 변환한다.
   g_lol_write_images: [{ data(base64), format, preview(dataURL) }] — 배열 순서 = 글에 보이는 순서 */
const LOL_WRITE_IMAGES_MAX = 10
const LOL_WRITE_IMAGE_MAX_BYTES = 30 * 1024 * 1024 // 서버 상한 (LegacyPostImage.byte_size)

function lol_base64_bytes(b64)
{
	var n = b64 ? b64.length : 0
	if(!n)
		return 0
	return Math.floor(n * 3 / 4) - (b64[n - 1] == '=' ? 1 : 0) - (b64[n - 2] == '=' ? 1 : 0)
}

/* 파일 → { data, format, preview }. 읽지 못하면 null. force_jpeg 면 GIF·WebP 도 JPEG 로 (고정짤) */
function lol_read_write_image(file, force_jpeg)
{
	return new Promise(function(resolve) {
		var reader = new FileReader()
		reader.onerror = function() { resolve(null) }
		reader.onload = function() {
			var url = String(reader.result || '')
			var keep = !force_jpeg && g_lol_keep_original_formats[file.type]
			if(keep)
				return resolve({ data: url.split(',')[1] || '', format: keep, preview: url })
			var img = new Image()
			img.onerror = function() { resolve(null) }
			img.onload = function() {
				lol_write_canvas.width = img.naturalWidth
				lol_write_canvas.height = img.naturalHeight
				lol_write_canvas.getContext('2d').drawImage(img, 0, 0)
				var jpeg = lol_write_canvas.toDataURL('image/jpeg')
				resolve({ data: jpeg.split(',')[1] || '', format: 'jpg', preview: jpeg })
			}
			img.src = url
		}
		reader.readAsDataURL(file)
	})
}

async function lol_write_images_add(files)
{
	var list = Array.prototype.filter.call(files || [], function(f) { return f && /^image\//.test(f.type) })
	if(!list.length)
		return alert('이미지가 아닙니다.')
	var room = LOL_WRITE_IMAGES_MAX - g_lol_write_images.length
	if(list.length > room)
		alert('사진은 최대 ' + LOL_WRITE_IMAGES_MAX + '장까지 첨부할 수 있습니다.')
	if(room <= 0)
		return
	var take = list.slice(0, room)
	g_lol_write_images_busy += take.length
	g_lol_write_slot_open = false
	lol_write_images_render()
	for(var file of take)
	{
		var got = await lol_read_write_image(file)
		g_lol_write_images_busy--
		// 읽는 동안 다른 붙여넣기가 겹칠 수 있어 담기 직전에 다시 확인한다
		if(got && got.data && g_lol_write_images.length < LOL_WRITE_IMAGES_MAX)
		{
			if(lol_base64_bytes(got.data) > LOL_WRITE_IMAGE_MAX_BYTES)
				alert('사진 한 장이 30MB 를 넘어 첨부할 수 없습니다.' + (file.name ? '\n(' + file.name + ')' : ''))
			else
				g_lol_write_images.push(got)
		}
		lol_write_images_render()
	}
}

function lol_write_images_clear()
{
	g_lol_write_images = []
	g_lol_write_slot_open = false
	g_lol_write_drag = -1
	lol_write_images_render()
}

/* [전체 비우기] — 실수로 여러 장을 날리지 않도록 2장부터는 확인한다 */
function lol_onclick_write_images_clear()
{
	if(g_lol_write_images.length > 1 && !confirm('첨부한 사진 ' + g_lol_write_images.length + '장을 모두 뺄까요?'))
		return
	lol_write_images_clear()
}

function lol_write_images_make_tile(image, index)
{
	var tile = document.createElement('div')
	tile.classList.add('lol_write_images_tile')
	tile.draggable = true
	tile.addEventListener('dragstart', function(e) {
		g_lol_write_drag = index
		tile.toggleAttribute('dragging', true)
		try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)) } catch(err) {}
	})
	tile.addEventListener('dragend', function() { g_lol_write_drag = -1; lol_write_images_render() })
	tile.addEventListener('dragover', function(e) {
		if(g_lol_write_drag < 0) // 파일 드롭은 점선 칸에서만 받는다
			return
		e.preventDefault()
		e.stopPropagation()
		try { e.dataTransfer.dropEffect = 'move' } catch(err) {}
		tile.toggleAttribute('drag_over', true)
	})
	tile.addEventListener('dragleave', function() { tile.toggleAttribute('drag_over', false) })
	tile.addEventListener('drop', function(e) {
		if(g_lol_write_drag < 0)
			return
		e.preventDefault()
		e.stopPropagation()
		var from = g_lol_write_drag, to = index
		g_lol_write_drag = -1
		if(from != to)
			g_lol_write_images.splice(to, 0, g_lol_write_images.splice(from, 1)[0])
		lol_write_images_render()
	})

	var img = document.createElement('img')
	img.src = image.preview
	img.title = '끌어다 놓으면 사진 순서가 바뀝니다.'
	tile.appendChild(img)

	var order = document.createElement('div') // 실제로 보일 순서
	order.toggleAttribute('order', true)
	order.textContent = String(index + 1)
	tile.appendChild(order)

	var del = document.createElement('div')
	del.toggleAttribute('del', true)
	del.classList.add('no-drag')
	del.textContent = '✕'
	del.title = '이 사진 빼기'
	del.onclick = function(e) { e.preventDefault(); e.stopPropagation(); g_lol_write_images.splice(index, 1); lol_write_images_render() }
	tile.appendChild(del)
	return tile
}

/* 붙여넣기/드롭 칸 — 예전의 빨간 점선 사각형과 같은 모양. on_files(files) 로 넘긴다 */
function lol_make_image_drop_slot(on_files)
{
	var input = document.createElement('input')
	input.type = 'text'
	input.classList.add('lol_write_images_drop')
	input.placeholder = '여기에 붙여넣기(Ctrl+V) 또는 파일 드롭'
	input.maxLength = 0
	input.addEventListener('input', function() { input.value = '' }) // 글자는 남기지 않는다
	input.addEventListener('paste', function(e) {
		var cd = e.clipboardData || window.clipboardData
		if(cd && cd.files && cd.files.length)
		{
			e.preventDefault()
			on_files(cd.files)
		}
	})
	var stop = function(e) { e.preventDefault(); e.stopPropagation() }
	input.addEventListener('dragenter', function(e) { stop(e); input.toggleAttribute('drag_over', true) })
	input.addEventListener('dragover', function(e) { stop(e); input.toggleAttribute('drag_over', true) })
	input.addEventListener('dragleave', function(e) { stop(e); input.toggleAttribute('drag_over', false) })
	input.addEventListener('drop', function(e) { stop(e); input.toggleAttribute('drag_over', false); on_files(e.dataTransfer && e.dataTransfer.files) })
	return input
}

/* 첨부란 전체를 상태에서 다시 그린다 (타일 → 점선 칸 또는 [+] → 안내문) */
function lol_write_images_render(focus_slot)
{
	lol_write_images_box.replaceChildren()
	g_lol_write_images.forEach(function(image, i) { lol_write_images_box.appendChild(lol_write_images_make_tile(image, i)) })

	var slot = null
	if(g_lol_write_images.length < LOL_WRITE_IMAGES_MAX)
	{
		if(g_lol_write_slot_open || !g_lol_write_images.length)
			lol_write_images_box.appendChild(slot = lol_make_image_drop_slot(lol_write_images_add))
		else
		{
			var add = document.createElement('div')
			add.classList.add('lol_write_images_tile', 'lol_write_images_add', 'no-drag')
			add.textContent = '+'
			add.title = '사진 더 첨부하기'
			add.onclick = function() { g_lol_write_slot_open = true; lol_write_images_render(true) }
			lol_write_images_box.appendChild(add)
		}
	}
	if(focus_slot && slot)
		slot.focus()

	lol_write_images_guide.textContent = g_lol_write_images_busy ? '이미지 첨부 중... 기다려주셈'
		: g_lol_write_images.length ? '사진 ' + g_lol_write_images.length + '/' + LOL_WRITE_IMAGES_MAX + '장 첨부됨 · 사진을 끌어다 놓으면 순서가 바뀝니다.'
		: ''
	lol_write_images_clear_button.style.display = g_lol_write_images.length ? '' : 'none'
	lol_write_images_bar.style.display = (g_lol_write_images_busy || g_lol_write_images.length) ? 'flex' : 'none'
}

/* ========== [v2] 댓글 답글 ==========
   댓글의 '답글' 을 누르면 입력창이 그 댓글 아래로 내려오고 '↳ 닉 님에게 답글' 띠가 뜬다. 등록할 때 parent_id 와 '@닉네임 ' 이 붙는다.
   입력창은 댓글 목록을 다시 그리기 전에 제자리(목록 아래)로 돌려 둔다 — 목록을 비울 때 같이 지워지지 않게 */
var g_lol_reply_target = null // { seq, nick }

function lol_onclick_reply_target()
{
	event.preventDefault()
	event.stopPropagation()
	var el = event.currentTarget
	g_lol_reply_target = { seq: el.getAttribute('seq'), nick: el.getAttribute('nick') || '' }
	lol_reply_target_attach()
	lol_rpanel_reply_board_input.focus()
}

function lol_reply_target_clear()
{
	if(!g_lol_reply_target)
		return
	g_lol_reply_target = null
	lol_reply_target_detach()
}

/* 입력창을 댓글 목록 아래 제자리로 (답글 띠는 지운다) */
function lol_reply_target_detach()
{
	var bar = document.getElementById('lol_rpanel_reply_target_bar')
	if(bar)
		bar.remove()
	if(lol_rpanel_reply_board_write_container.parentElement != lol_rpanel_reply_board)
		lol_rpanel_reply_board.appendChild(lol_rpanel_reply_board_write_container)
}

/* 답글 대상이 있으면 입력창을 그 댓글 바로 아래로 옮기고 띠를 보인다. 대상 댓글이 사라졌으면(삭제 등) 해제 */
function lol_reply_target_attach()
{
	lol_reply_target_detach()
	if(!g_lol_reply_target)
		return
	var item = lol_rpanel_reply_board_list.querySelector('.lol_reply_list_item[seq="' + String(g_lol_reply_target.seq).replace(/["\\]/g, '\\$&') + '"]')
	if(!item)
	{
		g_lol_reply_target = null
		return
	}

	var bar = document.createElement('div')
	bar.id = 'lol_rpanel_reply_target_bar'
	bar.classList.add('no-drag')
	var label = document.createElement('span')
	label.appendChild(document.createTextNode('↳ '))
	var nick = document.createElement('b')
	nick.textContent = g_lol_reply_target.nick
	label.appendChild(nick)
	label.appendChild(document.createTextNode(' 님에게 답글'))
	bar.appendChild(label)
	var cancel = document.createElement('span')
	cancel.toggleAttribute('cancel', true)
	cancel.textContent = '✕ 취소'
	cancel.onclick = lol_reply_target_clear
	bar.appendChild(cancel)
	item.after(bar, lol_rpanel_reply_board_write_container)
}

/* 답글을 부모 댓글 바로 아래로 정렬하고 depth 를 매긴다 (API 는 parent_id 만 준다). 부모가 없는 답글은 일반 댓글처럼 */
function lol_thread_replies(replys)
{
	var by_seq = {}, children = {}, roots = []
	for(var r of replys)
		by_seq[String(r['reply_seq'])] = r
	for(var r of replys)
	{
		var pid = String(r['parent_id'] || 0)
		if(pid != '0' && by_seq[pid])
			(children[pid] = children[pid] || []).push(r)
		else
			roots.push(r)
	}
	var out = []
	var walk = function(list, depth) {
		for(var r of list)
		{
			r.depth = depth
			out.push(r)
			if(children[String(r['reply_seq'])])
				walk(children[String(r['reply_seq'])], depth + 1)
		}
	}
	walk(roots, 0)
	return out
}

/* '@닉네임' 강조 (댓글 본문은 innerHTML 로 그려지므로 태그를 끼워 넣는다).
   nicknames: 이 글의 작성자·댓글 작성자들. 공백이 든 닉네임('캐러밴 속의 세렌디피디')도 통째로 잡히도록
   아는 닉네임을 긴 것부터 먼저 맞추고, 그 밖에는 공백 전까지 한 단어로 본다 */
function lol_decorate_mentions(text, nicknames)
{
	var known = (nicknames || [])
		.filter(function(n) { return n })
		.map(function(n) { return String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') })
		.sort(function(a, b) { return b.length - a.length })
	var reg = new RegExp('(^|[\\s>])@(' + known.concat(['[^\\s<@]+']).join('|') + ')', 'g')
	return String(text == null ? '' : text).replace(reg, function(m, pre, nick) { return pre + '<span class="lol_mention">@' + nick + '</span>' })
}

/* [v2] 5번째 이후 첨부 사진: 상세의 사진 칸은 4개뿐이라 image_urls 의 나머지를 같은 모양으로 img4 아래에 이어 붙인다.
   같은 글을 다시 그릴 때는 사진별 확대/축소 상태를 유지한다 (img1~4 와 같은 동작) */
function lol_rpanel_update_extra_images(urls)
{
	var old = Array.prototype.slice.call(document.querySelectorAll('.lol_rpanel_img_extra'))
	var keep = g_lol_same_article_prev ? old.map(function(e) { return e.hasAttribute('small') }) : []
	old.forEach(function(e) { e.remove() })

	var after = lol_rpanel_body_img4
	urls.forEach(function(url, i) {
		var div = document.createElement('div')
		div.classList.add('lol_rpanel_img_body', 'lol_rpanel_img_extra')
		div.toggleAttribute('small', i < keep.length ? keep[i] : true)
		var img = document.createElement('img')
		img.classList.add('lol_rpanel_img_img')
		img.src = lol_convert_uri_to_mirror(url)
		div.appendChild(img)
		var add = document.createElement('div')
		add.classList.add('lol_rpanel_img_add')
		add.setAttribute('src', url)
		add.onclick = lol_onclick_img_add
		div.appendChild(add)
		div.onclick = lol_onclick_img
		after.after(div)
		after = div
	})
}

/* ========== [v2] 롤백 모달 (차단목록·고정짤 등록). 모양은 index.css 의 .lol_modal ========== */
function lol_modal_make(id, title)
{
	var overlay = document.createElement('div')
	overlay.id = id
	overlay.classList.add('lol_modal')
	overlay.onclick = function(e) { if(e.target == overlay) overlay.remove() }

	var box = document.createElement('div')
	box.toggleAttribute('box', true)
	var head = document.createElement('div')
	head.toggleAttribute('head', true)
	var title_el = document.createElement('div')
	title_el.toggleAttribute('title', true)
	title_el.textContent = title
	head.appendChild(title_el)
	var sub = document.createElement('div')
	sub.toggleAttribute('sub', true)
	head.appendChild(sub)
	box.appendChild(head)
	var body = document.createElement('div')
	body.toggleAttribute('body', true)
	box.appendChild(body)
	var status = document.createElement('div')
	status.toggleAttribute('status', true)
	box.appendChild(status)
	var buttons = document.createElement('div')
	buttons.toggleAttribute('buttons', true)
	box.appendChild(buttons)
	overlay.appendChild(box)
	document.body.appendChild(overlay)

	return { overlay: overlay, title: title_el, sub: sub, body: body, status: status, buttons: buttons, close: function() { overlay.remove() } }
}

function lol_modal_button(text, onclick, kind)
{
	var button = document.createElement('button')
	button.type = 'button'
	button.classList.add('no-drag')
	if(kind)
		button.setAttribute('kind', kind)
	button.textContent = text
	button.onclick = onclick
	return button
}

/* ========== [v2] 차단목록 (롤백 앱 '내 정보 → 차단 관리'와 같은 목록) ========== */
var g_lol_block_modal = null

function lol_block_list_show()
{
	if(g_lol_block_modal && g_lol_block_modal.overlay.isConnected)
		return
	var m = g_lol_block_modal = lol_modal_make('lol_block_list_modal', '차단목록')
	m.sub.textContent = '차단한 사용자의 글과 댓글은 보이지 않습니다.'
	m.body.textContent = '불러오는 중…'
	m.clear_all = lol_modal_button('전체 해제', function() {
		if(!confirm('차단한 사용자를 모두 해제할까요?'))
			return
		m.status.textContent = '해제 중…'
		socket.emit('lol_unblock', lol_add_api_auth({ all: true }))
	}, 'danger')
	m.clear_all.style.display = 'none'
	m.buttons.appendChild(m.clear_all)
	m.buttons.appendChild(lol_modal_button('닫기', m.close))
	socket.emit('lol_block_list', lol_add_api_auth({}))
}

/* 서버의 lol_block_list 응답으로 목록을 그린다 */
function lol_block_list_render(data)
{
	var m = g_lol_block_modal
	if(!m || !m.overlay.isConnected)
		return
	m.body.replaceChildren()
	if(!data || !data.ok)
	{
		m.body.textContent = '차단목록을 불러오지 못했습니다.'
		return
	}

	var rows = data.results || []
	m.title.textContent = '차단목록 (' + rows.length + '명' + (data.block_limit ? ' / 최대 ' + data.block_limit + '명' : '') + ')'
	m.clear_all.style.display = rows.length ? '' : 'none'
	if(data.unblocked !== undefined)
		m.status.textContent = data.unblocked == 'all' ? '모두 해제했습니다.' : '해제했습니다.'
	if(!rows.length)
	{
		m.body.textContent = '차단한 사용자가 없습니다.'
		return
	}

	rows.forEach(function(b) {
		var row = document.createElement('div')
		row.toggleAttribute('row', true)
		var img = document.createElement('img')
		img.src = b.avatar_url ? lol_convert_uri_to_mirror(b.avatar_url) : 'static/icon_profile.png'
		row.appendChild(img)
		var info = document.createElement('div')
		info.toggleAttribute('info', true)
		var nick = document.createElement('div')
		nick.toggleAttribute('nick', true)
		nick.textContent = b.nickname || '(알 수 없음)'
		info.appendChild(nick)
		var when = document.createElement('div') // 앱과 같이 'N분 전 차단', 마우스를 올리면 정확한 시각
		when.toggleAttribute('when', true)
		var time = document.createElement('span')
		lol_set_time(time, b.created_at)
		when.appendChild(time)
		when.appendChild(document.createTextNode(' 차단'))
		info.appendChild(when)
		row.appendChild(info)
		row.appendChild(lol_modal_button('해제', function() {
			if(!confirm((b.nickname || '이 사용자') + ' 님의 차단을 해제할까요?\n해당 사용자의 글과 댓글이 다시 표시됩니다.'))
				return
			m.status.textContent = '해제 중…'
			socket.emit('lol_unblock', lol_add_api_auth({ blocked_user_id: b.id }))
		}, 'link'))
		m.body.appendChild(row)
	})
}

/* ========== [v2] 알림센터 (롤백 헤더 🔔): 알림 탭 + 채팅(쪽지) 탭 ==========
   서버의 lol_notif_badge 로 안 읽은 수를 받아 배지에 쓰고, 패널이 닫혀 있는데 수가 늘면 토스트로 알린다.
   목록·대화는 열 때마다 서버에서 받는다 (lol_notif_list / lol_memo_threads / lol_memo_thread) */
var g_lol_notif = { open: false, tab: 'notif', thread: null, total: null, toasted: false, timer: 0 }

function lol_notif_toggle(event)
{
	event.stopPropagation()
	if(g_lol_notif.open)
		lol_notif_close()
	else
		lol_notif_open()
}

function lol_notif_open()
{
	if(g_lol_android_id == g_lol_guest_id)
		return lol_login_api_account()
	g_lol_notif.open = true
	g_lol_notif.thread = null
	lol_notif_panel.style.display = 'flex'
	lol_notif_position()
	lol_notif_switch_tab(g_lol_notif.tab || 'notif')
}

function lol_notif_close()
{
	g_lol_notif.open = false
	g_lol_notif.thread = null
	lol_notif_panel.style.display = 'none'
}

/* 🔔 바로 아래, 화면 밖으로 나가지 않게 */
function lol_notif_position()
{
	var rect = lol_lpanel_notif.getBoundingClientRect()
	var width = Math.min(340, window.innerWidth - 12)
	lol_notif_panel.style.width = width + 'px'
	lol_notif_panel.style.left = Math.max(6, Math.min(rect.left, window.innerWidth - width - 6)) + 'px'
	lol_notif_panel.style.top = (rect.bottom + 6) + 'px'
}

function lol_notif_switch_tab(tab)
{
	g_lol_notif.tab = tab
	g_lol_notif.thread = null
	for(var t of lol_notif_panel.querySelectorAll('[tabs] > [tab]'))
		t.toggleAttribute('selected', t.getAttribute('tab') == tab)
	lol_notif_content.removeAttribute('conv')
	lol_notif_set_empty('불러오는 중…')
	socket.emit(tab == 'notif' ? 'lol_notif_list' : 'lol_memo_threads', lol_add_api_auth({}))
}

function lol_notif_set_empty(text)
{
	lol_notif_content.replaceChildren()
	lol_notif_content.textContent = text
	lol_notif_content.setAttribute('empty', '')
}

/* 알림 목록 (서버 lol_notif_list) */
function lol_notif_render_list(data)
{
	if(!g_lol_notif.open || g_lol_notif.tab != 'notif')
		return
	if(!data || !data.ok)
		return lol_notif_set_empty('알림을 불러오지 못했습니다.')
	var list = data.results || []
	if(!list.length)
		return lol_notif_set_empty('알림이 없습니다.')

	lol_notif_content.replaceChildren()
	lol_notif_content.removeAttribute('empty')
	list.forEach(function(n) {
		var item = document.createElement('div')
		item.toggleAttribute('item', true)
		item.toggleAttribute('unread', !n.read)
		var title = document.createElement('div')
		title.toggleAttribute('title', true)
		title.textContent = n.title
		item.appendChild(title)
		var text = document.createElement('div')
		text.toggleAttribute('text', true)
		text.textContent = n.body
		item.appendChild(text)
		var time = document.createElement('div')
		time.toggleAttribute('time', true)
		lol_set_time(time, n.created_at)
		item.appendChild(time)
		item.onclick = function() { lol_notif_click(n, item) }
		lol_notif_content.appendChild(item)
	})
}

/* 알림 클릭: 읽음 처리(배지는 바로 -1, 서버가 다시 센 값으로 보정)하고 글 알림이면 그 글로 */
function lol_notif_click(n, item)
{
	if(!n.read && n.id != null)
	{
		n.read = true
		item.removeAttribute('unread')
		lol_notif_badge_bump(-1)
		socket.emit('lol_notif_read', lol_add_api_auth({ notification_id: n.id }))
	}
	if(n.post_seq)
	{
		lol_notif_close()
		lol_request_article_detail(n.post_seq)
	}
}

/* 쪽지 대화 목록 (서버 lol_memo_threads) */
function lol_notif_render_threads(data)
{
	if(!g_lol_notif.open || g_lol_notif.tab != 'memo' || g_lol_notif.thread)
		return
	if(!data || !data.ok)
		return lol_notif_set_empty('채팅을 불러오지 못했습니다.')
	var list = data.results || []
	if(!list.length)
		return lol_notif_set_empty('주고받은 채팅이 없습니다.')

	lol_notif_content.replaceChildren()
	lol_notif_content.removeAttribute('empty')
	list.forEach(function(t) {
		var row = document.createElement('div')
		row.toggleAttribute('thread', true)
		var img = document.createElement('img')
		img.src = t.other_avatar_url ? lol_convert_uri_to_mirror(t.other_avatar_url) : 'static/icon_profile.png'
		row.appendChild(img)
		var main = document.createElement('div')
		main.toggleAttribute('main', true)
		var nick = document.createElement('div')
		nick.toggleAttribute('nick', true)
		nick.textContent = t.other_nickname || '(알 수 없음)'
		main.appendChild(nick)
		var last = document.createElement('div')
		last.toggleAttribute('last', true)
		last.textContent = t.last_body
		main.appendChild(last)
		row.appendChild(main)
		var meta = document.createElement('div')
		meta.toggleAttribute('meta', true)
		var time = document.createElement('span')
		lol_set_time(time, t.last_message_at)
		meta.appendChild(time)
		if(t.unread_count > 0)
		{
			var unread = document.createElement('span')
			unread.toggleAttribute('unread', true)
			unread.textContent = t.unread_count
			meta.appendChild(unread)
		}
		row.appendChild(meta)
		row.onclick = function() { lol_notif_open_thread(t) }
		lol_notif_content.appendChild(row)
	})
}

/* 대화 열기: 머리(←, 닉네임) + 메시지 영역 + 입력칸을 만들고 서버에 메시지를 요청 */
function lol_notif_open_thread(t)
{
	g_lol_notif.thread = t
	lol_notif_content.replaceChildren()
	lol_notif_content.removeAttribute('empty')
	lol_notif_content.setAttribute('conv', '')

	var head = document.createElement('div')
	head.toggleAttribute('head', true)
	var back = document.createElement('span')
	back.toggleAttribute('back', true)
	back.textContent = '←'
	back.onclick = function() { g_lol_notif.thread = null; lol_notif_switch_tab('memo') }
	head.appendChild(back)
	var nick = document.createElement('span')
	nick.toggleAttribute('nick', true)
	nick.textContent = t.other_nickname || ''
	head.appendChild(nick)
	lol_notif_content.appendChild(head)

	var body = document.createElement('div')
	body.id = 'lol_notif_conv_body'
	body.textContent = '불러오는 중…'
	lol_notif_content.appendChild(body)

	var input_row = document.createElement('div')
	input_row.toggleAttribute('input', true)
	var input = document.createElement('input')
	input.type = 'text'
	input.id = 'lol_notif_conv_input'
	input.placeholder = '메시지 입력'
	input.maxLength = 1000
	var send = document.createElement('button')
	send.type = 'button'
	send.id = 'lol_notif_conv_send'
	send.textContent = '전송'
	var do_send = function() {
		var text = input.value.trim()
		if(!text || send.disabled)
			return
		send.disabled = true
		socket.emit('lol_memo_send', lol_add_api_auth({ thread_id: t.id, body: text }))
	}
	send.onclick = do_send
	input.onkeydown = function(e) { if(e.key == 'Enter') { e.preventDefault(); do_send() } }
	input_row.appendChild(input)
	input_row.appendChild(send)
	lol_notif_content.appendChild(input_row)
	input.focus()

	socket.emit('lol_memo_thread', lol_add_api_auth({ thread_id: t.id }))
}

/* 'YYYY-MM-DD HH:mm:ss' → 'YYYY년 M월 D일' / 'HH:mm' (대화 날짜 구분선·말풍선 시각) */
function lol_format_day(value)
{
	var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
	return m ? m[1] + '년 ' + Number(m[2]) + '월 ' + Number(m[3]) + '일' : ''
}

function lol_format_hm(value)
{
	var m = /[T ](\d{2}):(\d{2})/.exec(String(value || ''))
	return m ? m[1] + ':' + m[2] : ''
}

/* 대화 메시지 (서버 lol_memo_thread; 보낸 뒤에도 같은 응답). 상대 메시지 묶음의 첫 개에만 아바타 */
function lol_notif_render_thread(data)
{
	var t = g_lol_notif.thread
	if(!g_lol_notif.open || !t || !data || String(data.thread_id) != String(t.id))
		return
	var body = document.getElementById('lol_notif_conv_body')
	if(!body)
		return
	var send = document.getElementById('lol_notif_conv_send')
	if(send)
		send.disabled = false
	var input = document.getElementById('lol_notif_conv_input')
	if(data.sent && input)
		input.value = ''
	if(!data.ok)
	{
		body.textContent = '대화를 불러오지 못했습니다.'
		return
	}

	body.replaceChildren()
	var prev_day = '', prev_mine = null
	data.messages.forEach(function(m) {
		var day = lol_format_day(m.created_at)
		if(day && day != prev_day)
		{
			var sep = document.createElement('div')
			sep.toggleAttribute('datesep', true)
			var label = document.createElement('span')
			label.textContent = day
			sep.appendChild(label)
			body.appendChild(sep)
			prev_day = day
			prev_mine = null
		}
		var row = document.createElement('div')
		row.toggleAttribute('row', true)
		row.toggleAttribute('mine', Boolean(m.mine))
		var show_avatar = !m.mine && prev_mine !== false
		if(!m.mine)
		{
			var avatar = document.createElement(show_avatar ? 'img' : 'div')
			avatar.toggleAttribute('avatar', true)
			if(show_avatar)
				avatar.src = t.other_avatar_url ? lol_convert_uri_to_mirror(t.other_avatar_url) : 'static/icon_profile.png'
			row.appendChild(avatar)
		}
		var bubble = document.createElement('div')
		bubble.toggleAttribute('msg', true)
		bubble.toggleAttribute('tail', show_avatar)
		if(m.body)
			bubble.appendChild(document.createTextNode(m.body))
		if(m.image_url)
		{
			var img = document.createElement('img')
			img.src = lol_convert_uri_to_mirror(m.image_url)
			bubble.appendChild(img)
		}
		var time = document.createElement('div')
		time.toggleAttribute('time', true)
		time.textContent = lol_format_hm(m.created_at)
		bubble.appendChild(time)
		row.appendChild(bubble)
		body.appendChild(row)
		prev_mine = Boolean(m.mine)
	})
	body.scrollTop = body.scrollHeight
}

/* ---- 배지와 토스트 ---- */
function lol_notif_badge_set(total)
{
	lol_lpanel_notif_badge.textContent = total > 99 ? '99+' : String(total)
	lol_lpanel_notif_badge.style.display = total > 0 ? 'block' : 'none'
}

/* 서버 재조회 없이 배지를 delta 만큼 바로 조정 (다음 lol_notif_badge 가 서버 값으로 보정) */
function lol_notif_badge_bump(delta)
{
	var current = parseInt(lol_lpanel_notif_badge.textContent, 10)
	if(isNaN(current))
		current = 0
	g_lol_notif.total = Math.max(0, current + delta)
	lol_notif_badge_set(g_lol_notif.total)
}

/* 서버의 lol_notif_badge { ok, notifications, memos, total }: 배지 갱신. 패널이 닫혀 있는데 늘었으면 토스트.
   로그인 직후 첫 집계는 읽지 않은 것이 있을 때 한 번만 알린다 */
function lol_notif_on_badge(data)
{
	if(!data || !data.ok)
		return
	var prev = g_lol_notif.total
	g_lol_notif.total = data.total
	lol_notif_badge_set(data.total)
	if(g_lol_notif.open)
		return
	if(prev === null)
	{
		if(data.total > 0 && !g_lol_notif.toasted)
		{
			g_lol_notif.toasted = true
			lol_notif_toast(data)
		}
		return
	}
	if(data.total > prev)
		lol_notif_toast(data)
}

function lol_notif_toast(data)
{
	var parts = []
	if(data.notifications > 0)
		parts.push('알림 ' + data.notifications + '개')
	if(data.memos > 0)
		parts.push('쪽지 ' + data.memos + '개')
	if(!parts.length)
		return
	make_toast(lol_lpanel, '🔔 읽지 않은 ' + parts.join(' · '), 2.5, 'flex-end', 'marginBottom:5vh')
}

/* 로그인하면 바로 한 번, 그 뒤 60초마다 안 읽은 수를 센다 (글목록을 새로 받을 때도 서버가 같이 보낸다) */
function lol_notif_poll_start()
{
	lol_notif_poll_stop()
	if(g_lol_android_id == g_lol_guest_id)
		return
	socket.emit('lol_notif_badge', lol_add_api_auth({}))
	g_lol_notif.timer = setInterval(function() {
		if(g_lol_android_id != g_lol_guest_id && socket.connected)
			socket.emit('lol_notif_badge', lol_add_api_auth({}))
	}, 60000)
}

function lol_notif_poll_stop()
{
	if(g_lol_notif.timer)
		clearInterval(g_lol_notif.timer)
	g_lol_notif.timer = 0
}

/* 로그아웃: 폴링 중단, 배지·패널 정리 */
function lol_notif_reset()
{
	lol_notif_poll_stop()
	lol_notif_close()
	g_lol_notif.total = null
	g_lol_notif.toasted = false
	lol_notif_badge_set(0)
}

/* ========== [v2] 고정짤 (내 글에 자동으로 붙는 이미지, 프로필의 fixed_image_id) ========== */
var g_lol_fixed_image_data = ''

function lol_onclick_userinfo_fixed_image_set()
{
	event.stopPropagation()
	lol_lpanel_userinfo_menu.style.display = 'none'
	if(document.getElementById('lol_fixed_image_modal'))
		return

	g_lol_fixed_image_data = ''
	var m = lol_modal_make('lol_fixed_image_modal', '고정짤 등록')
	m.sub.textContent = '이미지를 복사한 뒤 아래 칸에 붙여넣기(Ctrl+V)하거나 파일을 끌어다 놓으세요. 등록하면 내 글에 자동으로 붙습니다. (정지 이미지로 저장)'

	var preview = document.createElement('img')
	preview.toggleAttribute('preview', true)
	preview.title = '누르면 다시 고릅니다'
	preview.style.display = 'none'
	var slot = lol_make_image_drop_slot(async function(files) {
		var file = Array.prototype.find.call(files || [], function(f) { return f && /^image\//.test(f.type) })
		if(!file)
			return alert('이미지가 아닙니다.')
		m.status.textContent = '이미지 읽는 중…'
		var got = await lol_read_write_image(file, true)
		if(!got)
		{
			m.status.textContent = '이미지를 읽지 못했습니다.'
			return
		}
		g_lol_fixed_image_data = got.data
		preview.src = got.preview
		preview.style.display = ''
		slot.style.display = 'none'
		m.status.textContent = '이미지가 준비되었습니다. [등록] 을 누르세요.'
	})
	preview.onclick = function() {
		g_lol_fixed_image_data = ''
		preview.style.display = 'none'
		slot.style.display = ''
		m.status.textContent = ''
		slot.focus()
	}
	m.body.appendChild(slot)
	m.body.appendChild(preview)
	m.buttons.appendChild(lol_modal_button('취소', m.close))
	m.buttons.appendChild(lol_modal_button('등록', function() {
		if(!g_lol_fixed_image_data)
			return alert('이미지를 먼저 붙여넣어 주세요.')
		m.status.textContent = '등록 중…'
		lol_request_api_credentials(function() {
			socket.emit('lol_fixed_image', lol_add_api_auth({ image: g_lol_fixed_image_data }))
		})
	}, 'primary'))
	setTimeout(function() { slot.focus() }, 0)
}

function lol_onclick_userinfo_fixed_image_clear()
{
	event.stopPropagation()
	lol_lpanel_userinfo_menu.style.display = 'none'
	if(!confirm('고정짤을 삭제할까요?'))
		return
	lol_request_api_credentials(function() {
		socket.emit('lol_fixed_image', lol_add_api_auth({ clear: true }))
	})
}

function readAsDataURL_async(file) {
	return new Promise((resolve, reject) => {
	  let reader = new FileReader();
  
	  reader.onload = () => {
		resolve(reader.result);
	  };
  
	  reader.onerror = reject;
  
	  reader.readAsDataURL(file);
	})
}

/* 아이콘 변경 - 클립보드로부터 이미지 첨부 */
function lol_icon_change_onpaste()
{
	var pasteObj = (event.clipboardData || window.clipboardData); 
	var blob = pasteObj.files[0]
	if(!blob)
	{
		console.log('이미지 첨부 실패: 클립보드 내용이 이미지가 아니다..')
		return
	}
	console.log('이미지 첨부 성공!~')
	var reader = new FileReader()
	reader.onload = function(ev) { 
		var ret = ev.target.result
		
		lol_rpanel_body_icon_change_placeholder.style.display = 'none'
		lol_rpanel_body_icon_change_image.src = ret
	}
	reader.readAsDataURL(blob)
}

function lol_icon_change_image_onload()
{
	g_lol_icon_change_has_image = true
	lol_rpanel_body_icon_change_placeholder.style.display = 'none'
	lol_rpanel_body_icon_change_canvas_container.style.display = 'block'
	lol_rpanel_body_icon_change_size_slider.style.display = 'block'
	
	// 드래그 정보에 대한 초기화
	g_lol_icon_change_image_width = lol_rpanel_body_icon_change_image.naturalWidth
	g_lol_icon_change_image_height = lol_rpanel_body_icon_change_image.naturalHeight
	lol_rpanel_body_icon_change_canvas.width = g_lol_icon_change_image_width
	lol_rpanel_body_icon_change_canvas.height = g_lol_icon_change_image_height

	g_lol_icon_change_canvas_context = lol_rpanel_body_icon_change_canvas.getContext('2d')
	g_lol_icon_change_canvas_context.fillStyle = '#000000'
	g_lol_icon_change_canvas_context.strokeStyle = '#ff0000'
	g_lol_icon_change_canvas_context.lineWidth = 2

	var less = g_lol_icon_change_image_height < g_lol_icon_change_image_width ? g_lol_icon_change_image_height : g_lol_icon_change_image_width
	var quarter_less = less / 4
	g_lol_icon_change_start_x = Math.floor(g_lol_icon_change_image_width / 2 - quarter_less)
	g_lol_icon_change_start_y = Math.floor(g_lol_icon_change_image_height / 2 - quarter_less)
	g_lol_icon_change_size = Math.floor(quarter_less * 2)

	lol_rpanel_body_icon_change_size_slider.max = less
	lol_rpanel_body_icon_change_size_slider.value = g_lol_icon_change_size

	lol_icon_change_canvas_draw()
}

/* 아이콘 변경 - 이미지 첨부란의 불필요한 문자 제거  */
function lol_icon_change_clear_text()
{
	lol_rpanel_body_icon_change_placeholder.value = ''
}

/* 아이콘 변경 - 현재 영역 Draw */
function lol_icon_change_canvas_draw()
{
	// g_lol_icon_change_canvas_context.clearRect()
	g_lol_icon_change_canvas_context.fillRect(0, 0, g_lol_icon_change_image_width, g_lol_icon_change_image_height)
	g_lol_icon_change_canvas_context.clearRect(g_lol_icon_change_start_x, g_lol_icon_change_start_y, g_lol_icon_change_size, g_lol_icon_change_size)
	g_lol_icon_change_canvas_context.strokeRect(g_lol_icon_change_start_x-1, g_lol_icon_change_start_y-1, g_lol_icon_change_size+2, g_lol_icon_change_size+2)

	lol_rpanel_body_icon_change_canvas_over.width = g_lol_icon_change_size
	lol_rpanel_body_icon_change_canvas_over.height = g_lol_icon_change_size
	lol_rpanel_body_icon_change_canvas_over.getContext('2d').drawImage(lol_rpanel_body_icon_change_image, g_lol_icon_change_start_x, g_lol_icon_change_start_y, g_lol_icon_change_size, g_lol_icon_change_size, 0, 0, g_lol_icon_change_size, g_lol_icon_change_size)

	var sample_png_src = lol_rpanel_body_icon_change_canvas_over.toDataURL("image/png")
	lol_rpanel_header_icon.src = sample_png_src
	g_lol_icon_change_reply_icon_element.src = sample_png_src
}

/* 아이콘 변경 - 슬라이더 이벤트 */
function lol_icon_change_slider_onchange()
{
	var max_size_w = g_lol_icon_change_image_width - g_lol_icon_change_start_x
	var max_size_h = g_lol_icon_change_image_height - g_lol_icon_change_start_y
	var new_size = Math.min(event.target.value, max_size_w, max_size_h)

	g_lol_icon_change_size = new_size
	if(new_size != event.target.value)
		event.target.value = new_size

	lol_icon_change_canvas_draw()
}

function lol_icon_change_image_onmousedown(ev) 
{
	g_lol_icon_change_drag_start_mx = ev.x
	g_lol_icon_change_drag_start_my = ev.y
	g_lol_icon_change_drag_start_x = g_lol_icon_change_start_x
	g_lol_icon_change_drag_start_y = g_lol_icon_change_start_y

	lol_rpanel_body_icon_change_global_move_panel.style.display = 'block'
}

function lol_icon_change_move_panel_onmousemove(ev)
{
	// 이미지가 실제 크기보다 작을 시 보정
	var image_size_rate = g_lol_icon_change_image_width / lol_rpanel_body_icon_change_image.width
	var diff_x = (ev.x - g_lol_icon_change_drag_start_mx) * image_size_rate
	var diff_y = (ev.y - g_lol_icon_change_drag_start_my) * image_size_rate

	if(diff_x != 0 || diff_y != 0)
	{
		g_lol_icon_change_start_x = clamp(g_lol_icon_change_drag_start_x + diff_x, 0, g_lol_icon_change_image_width - g_lol_icon_change_size)
		g_lol_icon_change_start_y = clamp(g_lol_icon_change_drag_start_y + diff_y, 0, g_lol_icon_change_image_height - g_lol_icon_change_size)

		lol_icon_change_canvas_draw()
	}
}

function lol_icon_change_move_panel_onmouseup(ev)
{
	// 이미지가 실제 크기보다 작을 시 보정
	var image_size_rate = g_lol_icon_change_image_width / lol_rpanel_body_icon_change_image.width
	var diff_x = (ev.x - g_lol_icon_change_drag_start_mx) * image_size_rate
	var diff_y = (ev.y - g_lol_icon_change_drag_start_my) * image_size_rate

	if(diff_x != 0 || diff_y != 0)
	{
		g_lol_icon_change_start_x = clamp(g_lol_icon_change_drag_start_x + diff_x, 0, g_lol_icon_change_image_width - g_lol_icon_change_size)
		g_lol_icon_change_start_y = clamp(g_lol_icon_change_drag_start_y + diff_y, 0, g_lol_icon_change_image_height - g_lol_icon_change_size)

		lol_icon_change_canvas_draw()
	}

	lol_rpanel_body_icon_change_global_move_panel.style.display = 'none'
}

/* 아이콘 변경 - 내용 클리어 */
function lol_icon_change_clear_image()
{
	g_lol_icon_change_has_image = false
	lol_rpanel_body_icon_change_image.src = ''
	lol_rpanel_body_icon_change_placeholder.style.display = 'block'
	lol_rpanel_body_icon_change_canvas_container.style.display = 'none'
	lol_rpanel_body_icon_change_size_slider.style.display = 'none'
}

function lol_icon_change_cancel()
{
	lol_icon_change_clear_image()
}

function lol_icon_change_confirm()
{
	if(!g_lol_icon_change_has_image)
		return

	if(g_lol_android_id == g_lol_guest_id)
		return

	g_lol_icon_change_image_data = (lol_rpanel_body_icon_change_canvas_over.toDataURL("image/jpeg", 1.0).substr(23))

	lol_icon_change_clear_image()

	if(g_lol_icon_change_image_data.length == 0)
		return

	socket.emit('lol_icon_change', lol_add_api_auth({
		android_id: g_lol_android_id, 
		image: g_lol_icon_change_image_data
	}))

	alert('아이콘 변경을 요청했습니다.')
}

function lol_mirror_uri(uri)
{
	return format('{0}/lolwiki_mirror?uri={1}', location.origin, encodeURIComponent(uri))
}

/* [v2] 중계 주소(/lolwiki_mirror?uri=…)면 원래 주소로, 아니면 그대로 (채팅에 끌어다 놓은 이미지 공유용) */
function lol_unmirror_uri(uri)
{
	var m = /^(?:https?:\/\/[^/]+)?\/lolwiki_mirror\?uri=([^&#]+)/i.exec(String(uri || ''))
	if(!m)
		return uri
	try { return decodeURIComponent(m[1]) }
	catch(e) { return uri }
}

// [v2] 트래픽 절감: 이미지 서버가 https 로 직접 내려주는 이미지는 우리 서버를 거치지 않고 브라우저가 바로 받는다.
// (img.lolwiki.kr 는 1년 캐시 헤더를 주므로 재방문 시 요청조차 없다)
// 직접 로드가 실패하면 아래 error 리스너가 중계 주소로 한 번 바꿔 다시 시도한다.
var g_lol_direct_image_reg = /^https:\/\/(?:img\.lolwiki\.kr|i\.imgur\.com)\//i

function lol_convert_uri_to_mirror(uri)
{
	if(!uri || !uri.startsWith('http'))
		return uri
	if(/^http:\/\/i\.imgur\.com\//i.test(uri))
		uri = uri.replace(/^http:/i, 'https:')
	if(g_lol_direct_image_reg.test(uri))
		return uri
	if(/^https?:\/\/(?:img\.)?lolwiki\.kr(?:\/|$)/i.test(uri) || uri.startsWith('http://'))
		return lol_mirror_uri(uri)
	if(uri.startsWith('https://'))
		return uri

	return lol_mirror_uri(uri)
}

// [v2] 롤백 이미지 서버는 원본·리사이즈 이미지에 다른 사이트 Referer 가 붙으면 대체 이미지("BG.GG 접속시 확인 가능")를 준다.
// (예전에는 서버가 대신 받아서 Referer 가 없었다.) 직접 로드하는 이미지는 Referer 를 보내지 않도록,
// img.src 에 이 주소들이 들어가는 순간 referrerPolicy 를 먼저 no-referrer 로 맞춘다.
// 페이지 전체(meta referrer)로 끄면 유튜브 임베드가 동작하지 않으므로 이미지에만 적용한다.
;(function() {
	var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
	if(!desc || !desc.set)
		return
	Object.defineProperty(HTMLImageElement.prototype, 'src', {
		configurable: true,
		enumerable: desc.enumerable,
		get: desc.get,
		set: function(value) {
			if(typeof value == 'string' && g_lol_direct_image_reg.test(value))
				this.referrerPolicy = 'no-referrer'
			desc.set.call(this, value)
		}
	})
})()

document.addEventListener('error', function(e) {
	var img = e.target
	if(!img || img.tagName != 'IMG' || img.dataset.lolMirrored)
		return
	var src = img.getAttribute('src') || ''
	if(!g_lol_direct_image_reg.test(src))
		return
	img.dataset.lolMirrored = '1'
	img.src = lol_mirror_uri(src)
}, true)

if(typeof socket != 'undefined' && socket.connected)
	lol_restore_api_session()
