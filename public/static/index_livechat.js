/* =================== 유튜브·트위치 생방송 채팅 창 =========================
   생방송을 틀면 영상 위에 떠 있는 채팅 창을 보여 준다.
   - 위 막대를 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꾼다. 막대를 더블클릭하면 처음 자리로
   - 투명도 슬라이더, 닫기 버튼. 닫으면 음량 옆에 [라이브 채팅 켜기] 버튼이 생긴다
   - 위치·크기·투명도·닫힘 상태는 브라우저에 저장해서 영상이 바뀌거나 새로고침해도 유지한다
   - 닫혀 있거나 생방송이 아닐 때는 채팅 iframe 을 비워 둔다 (보이지 않는 채팅이 계속 돌지 않게) */

const LIVECHAT_STORAGE_KEY = 'livechat_window'
const LIVECHAT_DEFAULT_WIDTH = 350
const LIVECHAT_DEFAULT_HEIGHT = 500
const LIVECHAT_MIN_WIDTH = 300
const LIVECHAT_MIN_HEIGHT = 385 // 유튜브 채팅 입력칸까지 보이는 높이
const LIVECHAT_MARGIN = 16 // 처음 자리: 영상 영역 오른쪽 위에서 띄우는 간격

var g_livechat = {
	left: null, // null 이면 처음 자리 (화면 크기에 맞춰 계산)
	top: null,
	width: LIVECHAT_DEFAULT_WIDTH,
	height: LIVECHAT_DEFAULT_HEIGHT,
	opacity: 1,
	closed: false,
	video_id: '', // 지금 생방송 채팅 대상. 비어 있으면 생방송이 아님
	drag: null, // { mode: 'move' | 'resize', x, y, left, top, width, height }
	frame: 0, // 끄는 동안 requestAnimationFrame 번호
}

function livechat_load()
{
	try
	{
		var saved = JSON.parse(localStorage.getItem(LIVECHAT_STORAGE_KEY) || 'null')
		if(!saved)
			return
		for(var key of ['left', 'top', 'width', 'height', 'opacity'])
			if(typeof saved[key] == 'number' && isFinite(saved[key]))
				g_livechat[key] = saved[key]
		g_livechat.closed = saved.closed === true
	}
	catch(e) {}
}

function livechat_save()
{
	try
	{
		localStorage.setItem(LIVECHAT_STORAGE_KEY, JSON.stringify({
			left: g_livechat.left, top: g_livechat.top,
			width: g_livechat.width, height: g_livechat.height,
			opacity: g_livechat.opacity, closed: g_livechat.closed,
		}))
	}
	catch(e) {}
}

/* 창을 화면 안에 맞춘다. 크기가 화면보다 크면 줄이고, 밖으로 나갔으면 안으로 */
function livechat_clamp()
{
	var max_width = window.innerWidth
	var max_height = window.innerHeight
	g_livechat.width = Math.round(clamp(g_livechat.width, Math.min(LIVECHAT_MIN_WIDTH, max_width), max_width))
	g_livechat.height = Math.round(clamp(g_livechat.height, Math.min(LIVECHAT_MIN_HEIGHT, max_height), max_height))

	if(g_livechat.left === null || g_livechat.top === null)
	{
		// 영상 영역(오른쪽 채팅 패널을 뺀 폭)의 오른쪽 위
		var stage_right = window.innerWidth - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mainchat-width')) || 0)
		g_livechat.left = stage_right - g_livechat.width - LIVECHAT_MARGIN
		g_livechat.top = LIVECHAT_MARGIN
	}
	g_livechat.left = Math.round(clamp(g_livechat.left, 0, max_width - g_livechat.width))
	g_livechat.top = Math.round(clamp(g_livechat.top, 0, max_height - g_livechat.height))
}

/* 위치·크기·투명도를 화면에 반영 */
function livechat_apply()
{
	var style = youtube_live_chat_box.style
	style.left = g_livechat.left + 'px'
	style.top = g_livechat.top + 'px'
	style.width = g_livechat.width + 'px'
	style.height = g_livechat.height + 'px'
	style.setProperty('--livechat-opacity', g_livechat.opacity)
}

/* 보일지 말지: 창은 생방송 중이고 닫지 않았을 때, 켜기 버튼은 생방송 중인데 닫았을 때 */
function livechat_update_visibility()
{
	var available = Boolean(g_livechat.video_id) && g_nick != 'OBS'
	var show = available && !g_livechat.closed

	youtube_live_chat_box.style.display = show ? 'flex' : 'none'
	video_info_livechat_btn.style.display = available && g_livechat.closed ? 'block' : 'none'

	if(show)
	{
		livechat_clamp()
		livechat_apply()
	}
	else
		livechat_end_drag()

	// 보이지 않는 채팅은 비워서 계속 받아오지 않게 한다
	iframe_set_src(youtube_live_chat_iframe, show ? livechat_get_src(g_livechat.video_id) : '')
}

/* ---------- 외부에서 부르는 함수 (index_UI.js, index_socket.js, index_yt_plugin.js) ---------- */

function livechat_initial_resize()
{
	livechat_load()
	youtube_live_chat_header_slider.value = g_livechat.opacity

	youtube_live_chat_box_header.addEventListener('pointerdown', livechat_onpointerdown_header)
	youtube_live_chat_box_header.addEventListener('dblclick', livechat_ondblclick_header)
	youtube_live_chat_header_resize_box.addEventListener('pointerdown', livechat_onpointerdown_resize)
	youtube_live_chat_global_move_panel.addEventListener('pointermove', livechat_onpointermove)
	youtube_live_chat_global_move_panel.addEventListener('pointerup', livechat_end_drag)
	youtube_live_chat_global_move_panel.addEventListener('pointercancel', livechat_end_drag)
	youtube_live_chat_header_slider.addEventListener('input', livechat_oninput_slider)
	youtube_live_chat_header_slider.addEventListener('change', livechat_save)
	youtube_live_chat_header_close.addEventListener('click', livechat_close)
	video_info_livechat_btn.addEventListener('click', livechat_open)
	register_ui_tooltip_event(video_info_livechat_btn, '라이브 채팅 창을 다시 엽니다.')

	livechat_update_visibility()
}

/* 브라우저 창 크기가 바뀌면 화면 안으로 되돌린다 */
function livechat_window_clamp()
{
	if(youtube_live_chat_box.style.display == 'none')
		return
	livechat_clamp()
	livechat_apply()
}

/* 생방송 채팅 대상 설정 (같은 영상이면 아무것도 안 함) */
function livechat_set_video_id(video_id)
{
	if(g_livechat.video_id == video_id)
		return
	g_livechat.video_id = video_id
	livechat_update_visibility()
}

/* 생방송이 아님: 창과 켜기 버튼을 모두 숨긴다 */
function livechat_hide()
{
	if(!g_livechat.video_id)
		return
	g_livechat.video_id = ''
	livechat_update_visibility()
}

function livechat_close()
{
	g_livechat.closed = true
	livechat_save()
	livechat_update_visibility()
}

function livechat_open()
{
	g_livechat.closed = false
	livechat_save()
	livechat_update_visibility()
}

/* src 주소 얻어오기 */
function livechat_get_src(video_id)
{
	if(g_current_is_twitch)
	{
		if(is_dark_theme())
			return `https://www.twitch.tv/embed/${video_id}/chat?parent=${location.hostname}&darkpopout`
		return `https://www.twitch.tv/embed/${video_id}/chat?parent=${location.hostname}`
	}
	return 'https://gaming.youtube.com/live_chat?v=' + video_id + '&embed_domain=' + location.hostname
}

/* ---------- 끌어서 옮기기·크기 바꾸기 ----------
   채팅·영상 iframe 위로 지나가면 마우스 이벤트를 iframe 이 가져가므로,
   끄는 동안에는 화면 전체를 덮는 투명 패널이 이벤트를 받는다. 화면 갱신은 프레임마다 한 번만 */

function livechat_begin_drag(ev, mode)
{
	if(ev.button != 0)
		return
	ev.preventDefault()
	g_livechat.drag = { mode: mode, x: ev.clientX, y: ev.clientY, left: g_livechat.left, top: g_livechat.top, width: g_livechat.width, height: g_livechat.height }
	youtube_live_chat_global_move_panel.setAttribute('mode', mode)
	youtube_live_chat_global_move_panel.style.display = 'block'
	youtube_live_chat_box.toggleAttribute('dragging', true)
}

function livechat_onpointerdown_header(ev)
{
	// 슬라이더·닫기 버튼을 누른 건 끌기가 아니다
	if(ev.target.closest('#youtube_live_chat_header_slider, #youtube_live_chat_header_close'))
		return
	livechat_begin_drag(ev, 'move')
}

function livechat_onpointerdown_resize(ev)
{
	livechat_begin_drag(ev, 'resize')
}

function livechat_onpointermove(ev)
{
	var drag = g_livechat.drag
	if(!drag)
		return

	var dx = ev.clientX - drag.x
	var dy = ev.clientY - drag.y
	if(drag.mode == 'move')
	{
		g_livechat.left = clamp(drag.left + dx, 0, window.innerWidth - g_livechat.width)
		g_livechat.top = clamp(drag.top + dy, 0, window.innerHeight - g_livechat.height)
	}
	else
	{
		g_livechat.width = clamp(drag.width + dx, LIVECHAT_MIN_WIDTH, window.innerWidth - g_livechat.left)
		g_livechat.height = clamp(drag.height + dy, LIVECHAT_MIN_HEIGHT, window.innerHeight - g_livechat.top)
	}

	if(!g_livechat.frame)
		g_livechat.frame = requestAnimationFrame(function() {
			g_livechat.frame = 0
			livechat_apply()
		})
}

function livechat_end_drag()
{
	if(!g_livechat.drag)
		return
	g_livechat.drag = null
	youtube_live_chat_global_move_panel.style.display = 'none'
	youtube_live_chat_box.removeAttribute('dragging')
	if(g_livechat.frame)
	{
		cancelAnimationFrame(g_livechat.frame)
		g_livechat.frame = 0
	}
	livechat_clamp()
	livechat_apply()
	livechat_save()
}

/* 위 막대 더블클릭: 처음 자리·크기로 */
function livechat_ondblclick_header(ev)
{
	if(ev.target.closest('#youtube_live_chat_header_slider, #youtube_live_chat_header_close'))
		return
	g_livechat.left = null
	g_livechat.top = null
	g_livechat.width = LIVECHAT_DEFAULT_WIDTH
	g_livechat.height = LIVECHAT_DEFAULT_HEIGHT
	livechat_clamp()
	livechat_apply()
	livechat_save()
}

function livechat_oninput_slider()
{
	g_livechat.opacity = Number(youtube_live_chat_header_slider.value)
	youtube_live_chat_box.style.setProperty('--livechat-opacity', g_livechat.opacity)
}
