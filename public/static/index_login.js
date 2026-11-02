function login()
{
	login_button.style.display = 'none'

	g_nick = login_id.value.trim()
	g_nick = g_nick.replace(/(\'|\"|\?| )/g, '')
	if(!g_nick)
	{
		login_id.value = ''
		login_button.style.display = 'block'
		return
	}
	g_nick = g_nick.substr(0, 32)

	console.log('window에서 login')
	socket.emit('check_user', g_nick)
}

function disappear_login_scene()
{
	init_block.style.opacity -= 0.0125

	if(init_block.style.opacity > 0)
	{
		setTimeout(disappear_login_scene, 5)
		return
	}

	init_block.style.display = 'none'
}

/* 로그인창 엔터 단축키 */
function login_keydown()
{
	if (window.event.keyCode == 13)
		login()
}

/* [v2] 최근 입장한 닉네임 (최대 6개, 최근 것이 앞). 로그인 화면에 칩으로 보여 주고 누르면 바로 입장한다 */
const g_storage_recent_nicks_key = 'recent_nicks'
const LOGIN_RECENT_MAX = 6

function get_recent_nicks()
{
	try
	{
		var list = JSON.parse(localStorage.getItem(g_storage_recent_nicks_key) || '[]')
		return Array.isArray(list) ? list.filter(function(n) { return typeof n == 'string' && n }) : []
	}
	catch(e)
	{
		return []
	}
}

function remember_recent_nick(nick)
{
	if(!nick || nick == 'OBS')
		return
	var list = get_recent_nicks().filter(function(n) { return n != nick })
	list.unshift(nick)
	localStorage.setItem(g_storage_recent_nicks_key, JSON.stringify(list.slice(0, LOGIN_RECENT_MAX)))
}

function forget_recent_nick(nick)
{
	localStorage.setItem(g_storage_recent_nicks_key, JSON.stringify(get_recent_nicks().filter(function(n) { return n != nick })))
	render_login_recent()
}

function render_login_recent()
{
	var list = get_recent_nicks()
	login_recent.replaceChildren()
	login_recent.style.display = list.length ? 'flex' : 'none'
	list.forEach(function(nick) {
		var chip = document.createElement('span')
		chip.toggleAttribute('chip', true)
		chip.title = nick + ' (으)로 입장'
		chip.appendChild(document.createTextNode(nick))
		chip.onclick = function() {
			login_id.value = nick
			login()
		}
		var remove = document.createElement('i')
		remove.toggleAttribute('remove', true)
		remove.title = '목록에서 지우기'
		remove.textContent = '✕'
		remove.onclick = function(event) { event.stopPropagation(); forget_recent_nick(nick) }
		chip.appendChild(remove)
		login_recent.appendChild(chip)
	})
}