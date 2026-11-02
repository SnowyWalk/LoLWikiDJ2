'use strict'

const crypto = require('crypto')

const API_BASE_URL = 'https://lolwiki.kr/api/app/api/v1'
const IMAGE_UPLOAD_URL = 'https://img.lolwiki.kr/api/images'
const APP_VERSION = '2.0.3'
const APP_BUILD = '1784442393'
const GUEST_DEVICE_ID = 'LoLWikiDJ_Guest'
const BLOCK_CACHE_TTL_MS = 30 * 1000
const POST_CACHE_LIMIT = 1000
// 첨부 이미지 형식. GIF·WebP 는 캔버스로 변환하면 애니메이션이 사라지므로 원본 바이트를 그대로 올리고 형식도 그대로 알린다
const IMAGE_MIME = { gif: 'image/gif', webp: 'image/webp', jpg: 'image/jpeg' }
const MAX_POST_IMAGES = 10 // LegacyPostCreate.attachments 상한 (롤백 앱의 '사진 최대 10장'과 같다)

function firstValue(object, keys, fallback) {
	if(!object)
		return fallback

	for(const key of keys) {
		if(object[key] !== undefined && object[key] !== null)
			return object[key]
	}

	return fallback
}

function asString(value, fallback = '') {
	if(value === undefined || value === null)
		return fallback
	return String(value)
}

function asArray(value) {
	return Array.isArray(value) ? value.filter(Boolean) : []
}

function unique(values) {
	return values.filter((value, index) => value && values.indexOf(value) === index)
}

// 롤백 API 시각은 글은 '2026-07-21T15:44:15'(한국 시각, 시간대 없음), 댓글은 '…T15:47:26+09:00'처럼 섞여 온다.
// 브라우저에는 한국 시각 'YYYY-MM-DD HH:mm:ss' 하나로 통일해 보낸다 (상대 시간 표시는 브라우저가 한다)
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const isoDateReg = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/

function displayDate(value) {
	const text = asString(value).trim()
	const m = isoDateReg.exec(text)
	if(!m)
		return text

	let ms = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))
	if(m[7] && m[7] !== 'Z') {
		const sign = m[7][0] === '-' ? -1 : 1
		const digits = m[7].slice(1).replace(':', '')
		ms -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60 * 1000
	}
	else if(!m[7])
		ms -= KST_OFFSET_MS // 시간대가 없으면 한국 시각
	return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

// 롤백 API 오류 본문에서 사람이 읽을 사유를 꺼낸다 ({message} / {detail: '…'} / FastAPI 의 {detail: [{msg}]})
function responseMessage(body) {
	if(!body)
		return ''
	if(typeof body === 'string')
		return body
	const detail = body.detail
	if(Array.isArray(detail))
		return asString(detail[0] && (detail[0].msg || detail[0].message), '') || (detail[0] ? JSON.stringify(detail[0]) : '')
	return asString(body.message || detail || body.error || body.reason, '')
}

function requestId() {
	const bytes = crypto.randomBytes(16)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	const hex = bytes.toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function normalizeImageUrls(source) {
	const imageUrls = asArray(source && source.image_urls)
	const originalImageUrls = asArray(source && source.original_image_urls)
	const thumbnailUrls = asArray(source && source.image_thumb_urls)

	if(imageUrls.length)
		return unique(imageUrls)
	if(originalImageUrls.length)
		return unique(originalImageUrls)
	if(thumbnailUrls.length)
		return unique(thumbnailUrls)
	return unique([
		firstValue(source, ['image_url'], ''),
		firstValue(source, ['original_image_url'], '')
	])
}

function normalizeListPost(post) {
	const imageUrls = normalizeImageUrls(post)
	return {
		icon_img: asString(firstValue(post, ['avatar_url'], '')),
		post_title: asString(firstValue(post, ['title'], '')),
		reply_cnt: Number(firstValue(post, ['comments', 'comment_count'], 0)) || 0,
		before: displayDate(firstValue(post, ['created_at'], '')),
		post_date: displayDate(firstValue(post, ['created_at'], '')),
		nickname: asString(firstValue(post, ['author', 'nickname'], '')),
		views: Number(firstValue(post, ['views', 'view_count'], 0)) || 0,
		likes: Number(firstValue(post, ['likes', 'like_count'], 0)) || 0,
		pic_new: imageUrls.length ? 'remote-image' : '',
		youtube_url: asString(firstValue(post, ['youtube_url'], '')),
		doodlr: 0,
		badge_use: 0,
		alarm: Number(firstValue(post, ['report_count'], 0)) || 0,
		pic_multi: '',
		fixedpic: '',
		post_seq: asString(firstValue(post, ['post_seq', 'legacy_post_seq', 'id'], '')),
		author_id: asString(firstValue(post, ['author_id'], '')),
		image_urls: imageUrls
	}
}

// 내 식별자 전부. 레거시 계정은 글의 author_id 가 local_user_key('legacy:…')가 아니라 legacy_id(옛 android_id)로 오므로
// /users/me 가 주는 식별자 어느 것과 같아도 내 글로 본다
const IDENTITY_KEYS = ['local_user_key', 'user_key', 'id', 'legacy_id', 'legacy_android_id', 'legacy_device_id', 'android_id']

function identityIds(identity) {
	if(!identity)
		return []
	return unique(IDENTITY_KEYS.map(key => asString(identity[key], '')))
}

function normalizeDetailPost(post, identity) {
	const imageUrls = normalizeImageUrls(post)
	const authorId = asString(firstValue(post, ['author_id'], ''))
	const isMine = Boolean(firstValue(post, ['is_mine', 'my_post'], false)) || Boolean(authorId && identityIds(identity).includes(authorId))

	return {
		post_title: asString(firstValue(post, ['title'], '')),
		post_text: asString(firstValue(post, ['body', 'text'], '')),
		post_seq: asString(firstValue(post, ['post_seq', 'legacy_post_seq', 'id'], '')),
		post_date: displayDate(firstValue(post, ['created_at'], '')),
		likes: asString(firstValue(post, ['likes', 'like_count'], 0), '0'),
		pic_new: '',
		pic_multi: '',
		youtube_url: asString(firstValue(post, ['youtube_url'], '')),
		views: asString(firstValue(post, ['views', 'view_count'], 0), '0'),
		stack: asString(firstValue(post, ['author_stack_count', 'stack_count'], 0), '0'),
		nickname: asString(firstValue(post, ['author', 'nickname'], '')),
		doodlr: 0,
		icon_img: asString(firstValue(post, ['avatar_url'], '')),
		badge_use: 0,
		doodlrurls: '',
		fixedpic: '',
		my_post: isMine ? '1' : '0',
		my_vote: asString(firstValue(post, ['vote', 'my_vote'], ''), '') || 'neutral', // 'up' | 'down' | 'neutral' (viewer 를 보냈을 때만 온다)
		author_id: authorId,
		image_urls: imageUrls
	}
}

function normalizeComment(comment) {
	return {
		reply_seq: asString(firstValue(comment, ['comment_seq', 'id'], '')),
		parent_id: Number(firstValue(comment, ['parent_id'], 0)) || 0,
		nickname: asString(firstValue(comment, ['author', 'nickname'], '')),
		author_id: asString(firstValue(comment, ['author_id'], '')),
		icon_img: asString(firstValue(comment, ['avatar_url'], '')),
		badge_use: 0,
		reply_title: asString(firstValue(comment, ['body', 'text'], '')),
		reply_date: displayDate(firstValue(comment, ['created_at'], '')),
		reply_img: '',
		image_url: asString(firstValue(comment, ['image_url'], '')),
		my_post: firstValue(comment, ['is_mine'], false) ? 1 : 0,
		deleted: Boolean(firstValue(comment, ['deleted', 'is_deleted'], false))
	}
}

function normalizeUser(user, fallbackUserKey) {
	if(!user)
		return null

	const avatarImageId = asString(firstValue(user, ['avatar_image_id'], ''))
	const avatarUrl = asString(firstValue(user, ['avatar_url', 'icon_url'], avatarImageId ? `https://img.lolwiki.kr/i/${avatarImageId}/thumb` : ''))
	const stackCount = Number(firstValue(user, ['stack_count', 'point'], 0)) || 0
	const localUserKey = asString(firstValue(user, ['local_user_key', 'user_key', 'id'], fallbackUserKey))

	return Object.assign({}, user, {
		android_id: localUserKey,
		local_user_key: localUserKey,
		nickname: asString(firstValue(user, ['nickname'], '')),
		motto: asString(firstValue(user, ['motto'], '')),
		avatar_image_id: avatarImageId,
		fixed_image_id: asString(firstValue(user, ['fixed_image_id'], '')),
		avatar_url: avatarUrl,
		iconpic: avatarUrl,
		badge_use: Number(firstValue(user, ['badge_use'], 0)) || 0,
		point: stackCount,
		stack_count: stackCount
	})
}

function createLolWikiClient(request) {
	if(typeof request !== 'function')
		throw new TypeError('request function is required')

	const blockCache = new Map()
	const postCache = new Map()
	const paginationBySocket = new WeakMap()
	const identityCache = new Map() // local_user_key → /users/me 결과 (내 글 판정에 쓰는 식별자들)

	function rememberPost(postSeq, post) {
		if(postCache.has(postSeq))
			postCache.delete(postSeq)
		postCache.set(postSeq, post)
		if(postCache.size > POST_CACHE_LIMIT)
			postCache.delete(postCache.keys().next().value)
	}

	function deviceHeaders(deviceId, auth, json = true) {
		const headers = {
			'X-Device-ID': (auth && auth.deviceId) || deviceId || GUEST_DEVICE_ID,
			'X-App-Platform': 'android',
			'X-App-Version': APP_VERSION,
			'X-App-Build': APP_BUILD,
			'Accept': 'application/json'
		}
		if(auth && auth.accessToken)
			headers.Authorization = `Bearer ${auth.accessToken}`
		if(json)
			headers['Content-Type'] = 'application/json'
		return headers
	}

	function serializableAuth(auth) {
		return {
			access_token: auth && auth.accessToken || '',
			refresh_token: auth && auth.refreshToken || '',
			device_id: auth && auth.deviceId || '',
			user_key: auth && auth.userKey || ''
		}
	}

	function canRecoverAuth(auth) {
		return Boolean(auth && (
			auth.accessToken ||
			auth.refreshToken ||
			(auth.accountId && auth.password)
		))
	}

	function captureAuth(auth, response) {
		if(!auth)
			return false

		const responseAuth = response && (response.auth || response)
		const accessToken = asString(firstValue(responseAuth, ['access_token', 'accessToken'], ''))
		const refreshToken = asString(firstValue(responseAuth, ['refresh_token', 'refreshToken'], ''))
		if(!accessToken && !refreshToken)
			return false

		auth.accessToken = accessToken || auth.accessToken || ''
		auth.refreshToken = refreshToken || auth.refreshToken || ''
		if(typeof auth.onTokens === 'function')
			auth.onTokens(serializableAuth(auth))
		return true
	}

	function socketAuth(socket, source = {}) {
		return {
			accountId: asString(firstValue(source, ['account_id', 'accountId'], '')).trim(),
			password: asString(source.password),
			accessToken: asString(firstValue(source, ['access_token', 'accessToken'], '')),
			refreshToken: asString(firstValue(source, ['refresh_token', 'refreshToken'], '')),
			deviceId: asString(firstValue(source, ['device_id', 'deviceId'], GUEST_DEVICE_ID)),
			userKey: asString(firstValue(source, ['user_key', 'userKey', 'local_user_key'], '')),
			onTokens: tokens => {
				Object.assign(source, tokens)
				if(socket)
					socket.emit('lol_api_tokens', tokens)
			}
		}
	}

	async function loginAuth(auth, deviceId) {
		if(!auth || !auth.accountId || !auth.password)
			return false

		try {
			const response = await request({
				uri: `${API_BASE_URL}/users/login`,
				method: 'POST',
				headers: deviceHeaders(deviceId, null, true),
				body: { account_id: auth.accountId, password: auth.password },
				json: true,
				timeout: 15000
			})
			captureAuth(auth, response)
			return Boolean(auth.accessToken)
		}
		catch(error) {
			return false
		}
	}

	async function refreshAuth(auth, deviceId) {
		if(!auth || !auth.refreshToken)
			return false

		try {
			const response = await request({
				uri: `${API_BASE_URL}/auth/refresh`,
				method: 'POST',
				headers: deviceHeaders(deviceId, null, true),
				body: { refresh_token: auth.refreshToken, device_id: auth.deviceId || deviceId },
				json: true,
				timeout: 15000
			})
			captureAuth(auth, response)
			return Boolean(auth.accessToken)
		}
		catch(error) {
			auth.accessToken = ''
			auth.refreshToken = ''
			return false
		}
	}

	// 같은 인증 정보로 동시에 보낸 요청(글 본문·댓글)이 함께 401을 받으면 갱신을 한 번만 한다.
	// refresh 토큰이 1회용이면 두 번째 갱신이 실패하면서 막 받은 토큰까지 지워 버리기 때문
	function recoverAuth(auth, deviceId) {
		if(!auth)
			return Promise.resolve(false)
		if(!auth.recovering) {
			auth.recovering = (async () => await refreshAuth(auth, deviceId) || await loginAuth(auth, deviceId))()
				.finally(() => { auth.recovering = null })
		}
		return auth.recovering
	}

	async function apiRequest(method, path, options = {}) {
		function buildRequestOptions() {
			const requestOptions = {
				uri: `${API_BASE_URL}${path}`,
				method,
				headers: deviceHeaders(options.deviceId, options.auth, true),
				json: true,
				timeout: 15000
			}
			if(options.query)
				requestOptions.qs = options.query
			if(options.body !== undefined)
				requestOptions.body = options.body
			return requestOptions
		}

		try {
			const response = await request(buildRequestOptions())
			captureAuth(options.auth, response)
			return response
		}
		catch(error) {
			if(error && error.statusCode === 401 && options.allowReauth !== false) {
				const recovered = await recoverAuth(options.auth, options.deviceId)
				if(!recovered) {
					error.code = 'LOLWIKI_REAUTH_REQUIRED'
					throw error
				}
				const response = await request(buildRequestOptions())
				captureAuth(options.auth, response)
				return response
			}
			throw error
		}
	}

	async function withWriteStage(code, action) {
		try {
			return await action()
		}
		catch(error) {
			if(error && !error.code)
				error.code = code
			throw error
		}
	}

	async function uploadImage(image, deviceId, imageFormat = 'jpg') {
		if(!image)
			return null

		let buffer
		if(Buffer.isBuffer(image))
			buffer = image
		else if(image instanceof ArrayBuffer)
			buffer = Buffer.from(image)
		else if(ArrayBuffer.isView(image))
			buffer = Buffer.from(image.buffer, image.byteOffset, image.byteLength)
		else if(image && image.type === 'Buffer' && Array.isArray(image.data))
			buffer = Buffer.from(image.data)
		else {
			const encoded = asString(image).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
			buffer = Buffer.from(encoded, 'base64')
		}
		if(!buffer.length)
			throw new Error('LoLWiki image upload received an empty image')

		const normalizedFormat = IMAGE_MIME[imageFormat] ? imageFormat : 'jpg'
		const headers = deviceHeaders(deviceId, null, false)
		delete headers.Authorization
		const response = await withWriteStage('LOLWIKI_IMAGE_UPLOAD_FAILED', () => request({
			uri: IMAGE_UPLOAD_URL,
			method: 'POST',
			headers,
			formData: {
				password: 'lolwiki-app-marker',
				image: {
					value: buffer,
					options: {
						filename: `lolwikidj-${requestId()}.${normalizedFormat}`,
						contentType: IMAGE_MIME[normalizedFormat]
					}
				}
			},
			json: true,
			timeout: 30000
		}))
		const imageId = firstValue(response && response.data, ['id'], firstValue(response, ['image_id', 'id'], ''))
		if(!imageId)
			throw new Error('LoLWiki image upload did not return an image id')
		// byteSize: 글 첨부(attachments)에 필수인 실제 바이트 수 (API_NOTES: 0 이거나 없으면 IMAGE_SIZE_REQUIRED 로 거부)
		return { id: asString(imageId), format: normalizedFormat, byteSize: buffer.length }
	}

	async function getUserInfo(auth) {
		if(!auth)
			throw authError('LoLWiki browser authentication is required')

		const response = await apiRequest('GET', '/users/me', {
			deviceId: auth.deviceId,
			auth
		})
		const rawUser = firstValue(response, ['user', 'result'], response)
		const user = normalizeUser(rawUser, auth.userKey)
		if(!user || !user.local_user_key)
			throw authError('LoLWiki current-user response did not include a user key')

		auth.userKey = user.local_user_key
		identityCache.set(user.local_user_key, user)
		if(typeof auth.onTokens === 'function')
			auth.onTokens(serializableAuth(auth))
		return user
	}

	// 글목록 첫 페이지를 받을 때마다 안 읽은 알림·쪽지 수를 브라우저에 알린다 (알림센터 배지, 새 알림 토스트)
	async function getNewMemo(socket, userKey, auth) {
		if(!canRecoverAuth(auth))
			return false
		if(!auth.userKey)
			auth.userKey = userKey && userKey !== GUEST_DEVICE_ID ? userKey : ''
		if(!auth.userKey)
			auth.userKey = (await getUserInfo(auth)).local_user_key

		const counts = await unreadCounts(auth)
		if(socket)
			socket.emit('lol_notif_badge', Object.assign({ ok: true }, counts))
		return counts.total > 0
	}

	// ---- 알림센터: 알림(푸시)과 쪽지 스레드 (롤백 앱과 같은 엔드포인트) ----
	function normalizeNotification(item) {
		const deepLink = asString(firstValue(item, ['deep_link'], ''))
		return {
			id: item.id,
			title: asString(firstValue(item, ['title'], '')),
			body: asString(firstValue(item, ['body'], '')),
			created_at: displayDate(firstValue(item, ['created_at'], '')),
			read: Boolean(firstValue(item, ['read', 'is_read'], false)),
			post_seq: (/post\/(\d+)/.exec(deepLink) || [])[1] || '' // deep_link: lolwiki://post/<seq>?comment=<id>
		}
	}

	async function listNotifications(auth) {
		requireAuth(auth)
		await viewerKey(auth)
		const response = await apiRequest('GET', '/push/notifications', { deviceId: auth.deviceId, auth })
		return {
			results: asArray(response && response.results).map(normalizeNotification),
			unread_count: Number(firstValue(response, ['unread_count'], 0)) || 0
		}
	}

	// notificationId 를 주지 않으면 전부 읽음
	async function readNotification(auth, notificationId) {
		requireAuth(auth)
		const body = { local_user_key: await viewerKey(auth) }
		if(notificationId !== undefined && notificationId !== null && notificationId !== '')
			body.notification_id = notificationId
		await apiRequest('POST', '/push/notifications/read', { deviceId: auth.deviceId, auth, body })
	}

	function normalizeMemoThread(thread) {
		return {
			id: thread.id,
			other_nickname: asString(firstValue(thread, ['other_nickname'], '')),
			other_avatar_url: asString(firstValue(thread, ['other_avatar_url'], '')),
			last_body: asString(firstValue(thread, ['last_body'], '')) || (thread.last_image_id ? '[이미지]' : ''),
			last_message_at: displayDate(firstValue(thread, ['last_message_at', 'updated_at'], '')),
			unread_count: Number(firstValue(thread, ['unread_count'], 0)) || 0
		}
	}

	async function listMemoThreads(auth) {
		requireAuth(auth)
		const userKey = await viewerKey(auth)
		const response = await apiRequest('GET', '/memos', { deviceId: auth.deviceId, auth, query: { local_user_key: userKey } })
		const results = asArray(response && response.results).map(normalizeMemoThread)
		return { results, unread_count: results.reduce((sum, thread) => sum + thread.unread_count, 0) }
	}

	async function myIdentity(auth) {
		const userKey = await viewerKey(auth)
		return identityCache.get(userKey) || await getUserInfo(auth)
	}

	// 메시지의 mine 은 보낸 사람의 숫자 id 가 내 프로필 id 와 같은지로 정한다
	async function getMemoThread(auth, threadId) {
		requireAuth(auth)
		const identity = await myIdentity(auth)
		const response = await apiRequest('GET', `/memos/${encodeURIComponent(threadId)}`, {
			deviceId: auth.deviceId,
			auth,
			query: { local_user_key: identity.local_user_key }
		})
		const messages = asArray(response && (response.results || response.messages)).map(message => {
			const sender = firstValue(message, ['sender_user_id', 'sender_id'], null)
			const imageId = asString(firstValue(message, ['image_id'], ''))
			return {
				id: message.id,
				body: asString(firstValue(message, ['body'], '')),
				image_url: asString(firstValue(message, ['image_url'], '')) || (imageId ? `https://img.lolwiki.kr/i/${imageId}/resize` : ''),
				created_at: displayDate(firstValue(message, ['created_at'], '')),
				mine: sender !== null && String(sender) === String(identity.id)
			}
		})
		return { thread_id: asString(threadId), messages }
	}

	async function sendMemo(auth, threadId, body) {
		requireAuth(auth)
		const identity = await myIdentity(auth)
		await apiRequest('POST', `/memos/${encodeURIComponent(threadId)}/messages`, {
			deviceId: auth.deviceId,
			auth,
			body: { sender_local_user_key: identity.local_user_key, sender_nickname: identity.nickname || '', body }
		})
		return getMemoThread(auth, threadId)
	}

	// 배지용: 안 읽은 알림 수 + 안 읽은 쪽지 수. 한쪽이 실패해도 다른 쪽은 센다
	async function unreadCounts(auth) {
		requireAuth(auth)
		const [notifications, memos] = await Promise.all([
			listNotifications(auth).then(result => result.unread_count).catch(() => 0),
			listMemoThreads(auth).then(result => result.unread_count).catch(() => 0)
		])
		return { notifications, memos, total: notifications + memos }
	}

	function addComparable(set, value) {
		const comparable = asString(value).trim().toLocaleLowerCase()
		if(comparable)
			set.add(comparable)
	}

	function createBlockedAuthorFilter(blocks) {
		const ids = new Set()
		const nicknames = new Set()
		for(const block of blocks) {
			if(!block || block.blocked === false)
				continue

			const blockedUser = firstValue(block, ['blocked_user', 'target_user', 'target', 'user'], null)
			for(const key of ['blocked_user_id', 'target_user_id', 'target_id', 'user_id', 'blocked_local_user_key', 'target_local_user_key', 'local_user_key', 'target_legacy_android_id'])
				addComparable(ids, block[key])
			for(const key of ['blocked_nickname', 'target_nickname', 'nickname'])
				addComparable(nicknames, block[key])

			if(blockedUser && typeof blockedUser === 'object') {
				for(const key of ['id', 'user_id', 'local_user_key', 'user_key', 'legacy_android_id', 'android_id'])
					addComparable(ids, blockedUser[key])
				addComparable(nicknames, blockedUser.nickname)
			}
			else if(block.nickname)
				addComparable(ids, block.id)
		}
		return { ids, nicknames }
	}

	function isBlockedPost(post, blockedAuthors) {
		if(!post || (!blockedAuthors.ids.size && !blockedAuthors.nicknames.size))
			return false

		const author = post.author && typeof post.author === 'object' ? post.author : null
		const authorIds = [post.author_id, post.author_user_id, post.user_id, post.author_legacy_android_id]
		const authorNicknames = [typeof post.author === 'string' ? post.author : '', post.nickname]
		if(author) {
			authorIds.push(author.id, author.user_id, author.local_user_key, author.user_key, author.legacy_android_id, author.android_id)
			authorNicknames.push(author.nickname)
		}

		return authorIds.some(value => {
			const comparable = asString(value).trim().toLocaleLowerCase()
			return comparable && blockedAuthors.ids.has(comparable)
		}) || authorNicknames.some(value => {
			const comparable = asString(value).trim().toLocaleLowerCase()
			return comparable && blockedAuthors.nicknames.has(comparable)
		})
	}

	async function getBlockedAuthors(userKey, auth, forceRefresh = false) {
		if(!userKey || userKey === GUEST_DEVICE_ID || !auth)
			return createBlockedAuthorFilter([])

		const cached = blockCache.get(userKey)
		if(!forceRefresh && cached && Date.now() - cached.savedAt < BLOCK_CACHE_TTL_MS)
			return cached.value

		const response = await apiRequest('GET', '/blocks', {
			deviceId: auth.deviceId,
			auth,
			query: { local_user_key: userKey }
		}).catch(() => null)
		const value = createBlockedAuthorFilter(asArray(response && response.results))
		blockCache.set(userKey, { savedAt: Date.now(), value })
		return value
	}

	async function fetchArticleList(socket, targetUserKey, offset = 0, limit = 30, searchBody = '', searchNickname = '', popular = false, mine = false, auth = null) {
		const numericOffset = Math.max(0, Number(offset) || 0)
		const numericLimit = Math.max(1, Math.min(50, Number(limit) || 30))
		let viewerUserKey = auth && auth.userKey || ''
		let requestAuth = canRecoverAuth(auth) ? auth : null
		// [v2] 'mine' 은 두 가지 용도로 쓰인다: 내 글 보기 / 닉네임 우클릭으로 다른 유저 글 보기.
		// API 의 mode=mine 은 "로그인한 나의 글" 이라 author_id 를 무시하므로, 다른 유저 글은 mode=latest + author_id 로 조회한다.
		const explicitAuthor = mine && targetUserKey && targetUserKey !== GUEST_DEVICE_ID ? asString(targetUserKey) : ''
		if(!viewerUserKey && requestAuth) {
			try {
				viewerUserKey = (await getUserInfo(auth)).local_user_key
			}
			catch(error) {
				if((mine && !explicitAuthor) || !error || error.statusCode !== 401)
					throw error
				requestAuth = null
			}
		}
		const myPosts = mine && (!explicitAuthor || explicitAuthor === viewerUserKey)
		const otherAuthor = mine && !myPosts ? explicitAuthor : ''
		const pageKey = JSON.stringify({ targetUserKey, viewerUserKey, searchBody, searchNickname, popular, mine, numericLimit })
		let query = {
			mode: myPosts ? 'mine' : popular ? 'popular' : 'latest',
			limit: numericLimit
		}
		const savedPage = socket && numericOffset > 0 ? paginationBySocket.get(socket) : null
		if(savedPage && savedPage.key === pageKey) {
			if(savedPage.done)
				return []
			if(popular && savedPage.nextCursorSeq !== '') {
				query.cursor_likes = savedPage.nextCursorLikes
				query.cursor_seq = savedPage.nextCursorSeq
			}
			else if(savedPage.nextBeforeSeq)
				query.before_seq = savedPage.nextBeforeSeq
		}
		else
			query.offset = numericOffset

		if(searchBody)
			query.q = searchBody
		if(searchNickname)
			query.nickname = searchNickname
		if(viewerUserKey && requestAuth)
			query.viewer_id = viewerUserKey
		if(otherAuthor)
			query.author_id = otherAuthor
		else if(myPosts)
			query.author_id = viewerUserKey

		let response
		try {
			response = await apiRequest('GET', '/legacy-read-compat/posts', {
				deviceId: auth && auth.deviceId || GUEST_DEVICE_ID,
				auth: requestAuth,
				query
			})
		}
		catch(error) {
			if(myPosts || !requestAuth || !error || error.statusCode !== 401)
				throw error
			requestAuth = null
			viewerUserKey = ''
			query = Object.assign({}, query)
			delete query.viewer_id
			response = await apiRequest('GET', '/legacy-read-compat/posts', {
				deviceId: auth && auth.deviceId || GUEST_DEVICE_ID,
				auth: null,
				query
			})
		}
		let posts = asArray(response && response.results)
		const blockedAuthors = await getBlockedAuthors(viewerUserKey, requestAuth, numericOffset === 0)
		posts = posts.filter(post => !isBlockedPost(post, blockedAuthors))
		if(query.before_seq)
			posts = posts.filter(post => !Number(post.notice))
		for(const post of posts) {
			const postSeq = asString(firstValue(post, ['post_seq', 'legacy_post_seq', 'id'], ''))
			if(postSeq)
				rememberPost(postSeq, post)
		}
		if(socket) {
			const nextBeforeSeq = firstValue(response, ['next_before_seq'], '')
			const nextCursorLikes = firstValue(response, ['next_cursor_likes'], '')
			const nextCursorSeq = firstValue(response, ['next_cursor_seq'], '')
			const hasCursor = popular ? nextCursorSeq !== '' : nextBeforeSeq !== ''
			paginationBySocket.set(socket, {
				key: pageKey,
				nextBeforeSeq,
				nextCursorLikes,
				nextCursorSeq,
				done: Boolean(response && response.has_more === false) || !hasCursor
			})
		}

		if(viewerUserKey && socket && requestAuth)
			getNewMemo(socket, viewerUserKey, requestAuth).catch(() => {})

		return posts.map(normalizeListPost)
	}

	async function getArticleList(socket, targetUserKey, offset = 0, limit = 30, searchBody = '', searchNickname = '', popular = false, mine = false, auth = null) {
		try {
			return await fetchArticleList(socket, targetUserKey, offset, limit, searchBody, searchNickname, popular, mine, auth)
		}
		catch(error) {
			if(!socket || typeof socket.emit !== 'function')
				throw error
			emitSocketError(socket, error, '글목록 조회에 실패했습니다. 로그인 상태를 확인하거나 잠시 후 다시 시도해주세요.', 'LOLWIKI_LIST_FAILED')
			return []
		}
	}

	async function getArticleDetail(userKey, postSeq, auth = null) {
		const viewerUserKey = auth && (auth.userKey || (userKey !== GUEST_DEVICE_ID ? userKey : ''))
		const identity = viewerUserKey
			? identityCache.get(viewerUserKey) || { local_user_key: viewerUserKey }
			: null
		const query = { post_seq: postSeq }
		if(identity && identity.local_user_key) {
			query.viewer_id = identity.local_user_key
			query.local_user_key = identity.local_user_key // 내 추천 상태(vote)는 이 키로 받는다 (롤디칩 확장에서 확인)
		}

		const response = await apiRequest('GET', '/legacy-read-compat/post', {
			deviceId: auth && auth.deviceId || GUEST_DEVICE_ID,
			auth,
			query
		})
		const responsePost = firstValue(response, ['post', 'result'], null)
		const cachedPost = postCache.get(asString(postSeq))
		const post = responsePost ? Object.assign({}, cachedPost || {}, responsePost) : cachedPost
		if(responsePost)
			rememberPost(asString(postSeq), post)
		return post ? normalizeDetailPost(post, identity) : normalizeDetailPost({}, identity)
	}

	async function getArticleReplies(userKey, postSeq, auth = null) {
		const viewerUserKey = auth && (auth.userKey || (userKey !== GUEST_DEVICE_ID ? userKey : ''))
		const identity = viewerUserKey
			? { local_user_key: viewerUserKey }
			: null
		const query = { post_seq: postSeq, limit: 200 }
		if(identity && identity.local_user_key)
			query.viewer_id = identity.local_user_key
		const response = await apiRequest('GET', '/legacy-read-compat/comments', {
			deviceId: auth && auth.deviceId || GUEST_DEVICE_ID,
			auth,
			query
		})
		return asArray(response && response.results).map(normalizeComment)
	}

	async function getArticleAuthorId(postSeq) {
		// 롤백은 글 수정이 없어서 작성자는 바뀌지 않는다 → 목록·상세에서 받아 둔 글이 있으면 그대로 쓴다
		const cachedPost = postCache.get(asString(postSeq))
		const cachedAuthorId = cachedPost ? asString(firstValue(cachedPost, ['author_id'], '')) : ''
		if(cachedAuthorId)
			return cachedAuthorId

		const response = await apiRequest('GET', '/legacy-read-compat/post', {
			deviceId: GUEST_DEVICE_ID,
			query: { post_seq: postSeq }
		})
		return asString(firstValue(firstValue(response, ['post', 'result'], {}), ['author_id'], ''))
	}

	function userPayload(identity, overrides = {}) {
		return Object.assign({
			local_user_key: identity.local_user_key,
			nickname: identity.nickname || '롤백유저',
			motto: identity.motto,
			avatar_image_id: identity.avatar_image_id,
			fixed_image_id: identity.fixed_image_id
		}, overrides)
	}

	function authError(message, cause) {
		const error = new Error(message)
		error.code = 'LOLWIKI_AUTH_FAILED'
		if(cause && cause.statusCode)
			error.statusCode = cause.statusCode
		return error
	}

	function requireAuth(auth) {
		if(!canRecoverAuth(auth))
			throw authError('LoLWiki browser authentication is required')
		return auth
	}

	async function loginSession(auth) {
		if(!await loginAuth(auth, auth && auth.deviceId))
			throw authError('LoLWiki account login failed')
		const user = await getUserInfo(auth)
		return { auth: serializableAuth(auth), user }
	}

	async function restoreSession(auth) {
		const user = await getUserInfo(requireAuth(auth))
		return { auth: serializableAuth(auth), user }
	}

	async function logout(auth) {
		if(auth && auth.accessToken) {
			await apiRequest('POST', '/auth/logout', {
				deviceId: auth.deviceId,
				auth,
				allowReauth: false,
				body: { all_devices: false }
			})
		}
		if(auth) {
			auth.accessToken = ''
			auth.refreshToken = ''
		}
	}

	function emitSocketError(socket, error, fallbackMessage, fallbackCode = 'LOLWIKI_AUTH_FAILED') {
		socket.emit('lol_api_error', {
			code: error && error.code || fallbackCode,
			status_code: error && error.statusCode || 0,
			message: fallbackMessage
		})
	}

	function attachSocket(socket) {
		socket.on('lol_api_login', async function(data) {
			try
			{
				const result = await loginSession(socketAuth(socket, data && (data.auth || data)))
				socket.emit('lol_api_login', result)
			}
			catch(error)
			{
				emitSocketError(socket, error, '롤백과사전 로그인에 실패했습니다. 저장된 아이디와 비밀번호를 확인해주세요.')
			}
		})

		socket.on('lol_api_restore', async function(data) {
			try
			{
				const result = await restoreSession(socketAuth(socket, data && (data.auth || data)))
				socket.emit('lol_api_login', result)
			}
			catch(error)
			{
				emitSocketError(socket, error, '저장된 롤백과사전 인증정보로 자동 로그인하지 못했습니다.')
			}
		})

		socket.on('lol_api_logout', async function(data) {
			try
			{
				await logout(socketAuth(socket, data && (data.auth || data)))
			}
			catch(error)
			{
				if(!error || error.statusCode !== 401)
					return emitSocketError(socket, error, '롤백과사전 로그아웃 요청에 실패했습니다.')
			}
			socket.emit('lol_api_logout')
		})
	}

	// 롤백은 닉네임을 바꾸면 24시간 동안 다시 바꿀 수 없고, 거부 사유를 4xx 본문으로 알린다 → 사유를 그대로 돌려준다.
	// 200 이어도 본문 status 가 OK 가 아닌 경우가 있어 그것도 실패로 본다. 인증 문제(401)만 호출자에게 던진다.
	async function changeNickname(userKey, nickname, auth) {
		requireAuth(auth)
		const identity = await getUserInfo(auth)
		try {
			const response = await apiRequest('POST', '/users', {
				deviceId: auth.deviceId,
				auth,
				body: userPayload(identity, { nickname })
			})
			const status = response && response.status
			if(status !== undefined && status !== null && String(status).toUpperCase() !== 'OK')
				return { ok: false, status_code: 200, message: responseMessage(response) || '서버가 변경을 거부했습니다.' }
			blockCache.delete(userKey || identity.local_user_key)
			return { ok: true, nickname: asString(firstValue(response && response.user, ['nickname'], nickname)), message: '' }
		}
		catch(error) {
			if(error && error.statusCode && error.statusCode !== 401)
				return { ok: false, status_code: error.statusCode, message: responseMessage(error.error) || error.message }
			throw error
		}
	}

	async function registerBoardImage(uploaded, userKey, auth) {
		if(!uploaded)
			return
		const body = { image_id: uploaded.id, image_format: uploaded.format }
		if(uploaded.byteSize > 0)
			body.byte_size = uploaded.byteSize // 글의 attachments 와 같은 값으로 맞춰 둔다
		await withWriteStage('LOLWIKI_IMAGE_PENDING_FAILED', () => apiRequest('POST', '/board/legacy-write/images/pending', {
			deviceId: auth.deviceId,
			auth,
			body
		}))
	}

	// options.imageFormat: 'jpg' | 'gif' | 'webp', options.parentId: 답글이면 부모 댓글 번호 (댓글은 사진 1장뿐 — attachments 없음)
	async function writeReply(postSeq, userKey, body, image = '', auth, options = {}) {
		requireAuth(auth)
		const uploaded = image ? await uploadImage(image, auth.deviceId, options.imageFormat || 'jpg') : null
		await registerBoardImage(uploaded, userKey, auth)
		return withWriteStage('LOLWIKI_COMMENT_WRITE_FAILED', () => apiRequest('POST', `/board/legacy-write/posts/${postSeq}/comments`, {
			deviceId: auth.deviceId,
			auth,
			body: {
				body,
				parent_id: Number(options.parentId) || 0,
				mention_user_id: '',
				image_id: uploaded ? uploaded.id : '',
				image_format: uploaded ? uploaded.format : '',
				request_id: requestId()
			}
		}))
	}

	// action: 'up'(추천) | 'down'(비추천). 같은 표를 다시 보내면 취소, 반대 표는 전환 — 규칙은 서버가 정한다(롤백 앱과 동일).
	// 그래서 투표 뒤 글을 다시 읽어 실제 추천 수와 내 표 상태를 돌려준다 (추정하지 않는다)
	async function votePost(postSeq, userKey, auth, action = 'up') {
		requireAuth(auth)
		const response = await apiRequest('POST', `/board/legacy-write/posts/${postSeq}/vote`, {
			deviceId: auth.deviceId,
			auth,
			body: { action: action === 'down' ? 'down' : 'up' }
		})
		const ok = Boolean(response && response.status === 'OK')
		let vote = asString(firstValue(response, ['vote', 'vote_state', 'post_vote'], ''))
		let likes = null
		if(ok) {
			try {
				const detail = await getArticleDetail(userKey, postSeq, auth)
				likes = Number(detail.likes) || 0
				vote = detail.my_vote || vote
			}
			catch {
				// 재조회에 실패하면 투표 응답의 상태만 돌려준다
			}
		}
		return { ok, vote: vote || 'neutral', likes, post_seq: asString(postSeq) }
	}

	async function deleteReply(userKey, postSeq, replySeq, auth) {
		requireAuth(auth)
		return apiRequest('POST', `/board/legacy-write/posts/${postSeq}/comments/${replySeq}/delete`, {
			deviceId: auth.deviceId,
			auth,
			body: { request_id: requestId() }
		})
	}

	// images: [{ image, format }] (최대 10장, 배열 순서 = 글에 보이는 순서) 또는 예전처럼 이미지 하나(문자열)
	function normalizeImages(images) {
		if(!images)
			return []
		if(typeof images === 'string' || Buffer.isBuffer(images))
			return [{ image: images, format: 'jpg' }]
		if(!Array.isArray(images))
			return []
		return images
			.filter(item => item && item.image)
			.map(item => ({ image: item.image, format: asString(item.image_format || item.format, 'jpg') || 'jpg' }))
			.slice(0, MAX_POST_IMAGES)
	}

	// 사진 1장이면 지금까지 검증된 단일 image_id 경로, 2장 이상이면 앱과 같은 attachments 배열로 보낸다.
	// attachments 가 거부되면(422) 같은 request_id 로 첫 장만 붙여 글은 살린다 (request_id 가 같아 중복 등록되지 않는다).
	// 조용히 1장으로 줄어들면 원인을 알 수 없으므로 돌려주는 image_error 에 서버 사유를 담는다.
	async function writePost(userKey, subject, body, youtubeUrl, images, auth) {
		requireAuth(auth)
		const list = normalizeImages(images)
		const uploads = await Promise.all(list.map(item => uploadImage(item.image, auth.deviceId, item.format).catch(error => ({ error }))))
		const uploaded = uploads.filter(upload => upload && !upload.error)
		await Promise.all(uploaded.map(upload => registerBoardImage(upload, userKey, auth)))
		const failed = uploads.find(upload => upload && upload.error)
		let imageError = failed ? asString(failed.error && failed.error.message || failed.error) : ''

		const base = { title: subject, body, youtube_url: youtubeUrl || '', notice: false, request_id: requestId() }
		const single = () => Object.assign({}, base, {
			image_id: uploaded.length ? uploaded[0].id : '',
			image_format: uploaded.length ? uploaded[0].format : ''
		})
		// byte_size 는 반드시 실제 크기(>0) — 빠지거나 0 이면 서버가 IMAGE_SIZE_REQUIRED 로 거부한다 (API_NOTES)
		const multi = () => Object.assign({}, base, {
			attachments: uploaded.map(upload => ({ image_id: upload.id, image_format: upload.format, byte_size: upload.byteSize }))
		})
		const post = payload => withWriteStage('LOLWIKI_POST_WRITE_FAILED', () => apiRequest('POST', '/board/legacy-write/posts', {
			deviceId: auth.deviceId,
			auth,
			body: payload
		}))

		let attached = uploaded.length
		try {
			await post(uploaded.length > 1 ? multi() : single())
		}
		catch(error) {
			if(!(error && error.statusCode === 422 && uploaded.length > 1))
				throw error
			if(!imageError)
				imageError = '여러 장 첨부가 거부됨: ' + (responseMessage(error.error) || error.message)
			await post(single())
			attached = 1
		}
		return { attached, total: list.length, image_error: imageError }
	}

	// ---- 차단 (롤백 앱 '내 정보 → 차단 관리'와 같은 목록·엔드포인트) ----
	// 차단에는 대상의 숫자 user id 가 필요하다. 신 게시글 id 는 구 post_seq 에서 일정한 offset 을 뺀 값이라,
	// 최신 글에서 offset 을 구해 추정한 뒤 실제로 조회해 legacy_post_seq 가 맞는지 검증한다.
	// 실패하면 레거시 작성자는 legacy-identity 로 매핑한다 (롤디칩 확장과 같은 방법)
	let seqOffset = null
	async function getSeqOffset() {
		if(seqOffset !== null)
			return seqOffset
		const response = await apiRequest('GET', '/board/posts', { deviceId: GUEST_DEVICE_ID, query: { limit: 1 } }).catch(() => null)
		const item = asArray(response && response.results)[0]
		if(item && item.id != null && item.legacy_post_seq != null)
			seqOffset = Number(item.legacy_post_seq) - Number(item.id)
		return seqOffset
	}

	async function fetchNewPost(id) {
		const response = await apiRequest('GET', `/board/posts/${encodeURIComponent(id)}`, { deviceId: GUEST_DEVICE_ID }).catch(() => null)
		return response && (response.post || response.data || response)
	}

	function authorOf(post, postSeq) {
		if(!post || String(post.legacy_post_seq) !== String(postSeq) || !post.author || post.author.id == null)
			return null
		return { id: post.author.id, nickname: asString(post.author.nickname) }
	}

	async function getAuthorNumericId(postSeq, authorId) {
		const offset = await getSeqOffset()
		if(offset !== null) {
			const guess = Number(postSeq) - offset
			if(guess > 0) {
				const target = authorOf(await fetchNewPost(guess), postSeq)
				if(target)
					return target
			}
		}
		if(authorId && !String(authorId).startsWith('lolwiki-')) { // 레거시 작성자만 legacy-identity 가 유효
			const response = await apiRequest('GET', '/users/legacy-identity', { deviceId: GUEST_DEVICE_ID, query: { legacy_id: authorId } }).catch(() => null)
			const match = asArray(response && response.posts).find(post => String(post.legacy_post_seq) === String(postSeq))
			if(match && match.id != null)
				return authorOf(await fetchNewPost(match.id), postSeq)
		}
		return null
	}

	async function viewerKey(auth) {
		return auth.userKey || (await getUserInfo(auth)).local_user_key
	}

	async function setBlocked(auth, userKey, blockedUserId, blocked) {
		await apiRequest('POST', '/blocks', {
			deviceId: auth.deviceId,
			auth,
			body: { blocker_local_user_key: userKey, blocked_user_id: Number(blockedUserId), blocked: Boolean(blocked) }
		})
		blockCache.delete(userKey) // 다음 목록부터 바로 반영
	}

	async function blockUser(postSeq, auth) {
		requireAuth(auth)
		const userKey = await viewerKey(auth)
		const target = await getAuthorNumericId(postSeq, await getArticleAuthorId(postSeq))
		if(!target) {
			const error = new Error('차단 대상 정보를 확인하지 못했습니다.')
			error.code = 'LOLWIKI_BLOCK_TARGET_UNKNOWN'
			throw error
		}
		await setBlocked(auth, userKey, target.id, true)
		return { ok: true, nickname: target.nickname, blocked_user_id: target.id }
	}

	async function listBlocks(auth) {
		requireAuth(auth)
		const userKey = await viewerKey(auth)
		const response = await apiRequest('GET', '/blocks', { deviceId: auth.deviceId, auth, query: { local_user_key: userKey } })
		const results = asArray(response && response.results).map(block => ({
			id: block.id,
			nickname: asString(block.nickname),
			avatar_url: asString(block.avatar_url),
			created_at: displayDate(block.created_at) // 브라우저의 상대 시간 표시용 (한국 시각)
		}))
		return { results, block_limit: Number(response && response.block_limit) || 0 }
	}

	// blockedUserId: 숫자 id, 또는 'all' (전체 해제). 해제 뒤의 목록을 돌려준다
	async function unblock(auth, blockedUserId) {
		requireAuth(auth)
		const userKey = await viewerKey(auth)
		if(blockedUserId === 'all') {
			for(const block of (await listBlocks(auth)).results)
				await setBlocked(auth, userKey, block.id, false)
		}
		else
			await setBlocked(auth, userKey, blockedUserId, false)
		return listBlocks(auth)
	}

	// ---- 고정짤 (내 글에 자동으로 붙는 이미지): 프로필의 fixed_image_id ----
	// /users 는 프로필 전체를 덮어쓰므로 닉네임·모토·아바타를 함께 보낸다 (userPayload)
	async function setFixedImage(image, auth) {
		requireAuth(auth)
		const identity = await getUserInfo(auth)
		const uploaded = await uploadImage(image, auth.deviceId, 'jpg') // 고정짤은 정지 이미지
		await apiRequest('POST', '/users/images/pending', { deviceId: auth.deviceId, auth, body: { image_id: uploaded.id } })
		await apiRequest('POST', '/users', { deviceId: auth.deviceId, auth, body: userPayload(identity, { fixed_image_id: uploaded.id }) })
	}

	async function clearFixedImage(auth) {
		requireAuth(auth)
		const identity = await getUserInfo(auth)
		const payload = userPayload(identity, { clear_fixed_image: true })
		delete payload.fixed_image_id
		await apiRequest('POST', '/users', { deviceId: auth.deviceId, auth, body: payload })
	}

	async function changeIcon(userKey, image, auth) {
		requireAuth(auth)
		const identity = await getUserInfo(auth)
		const uploaded = await uploadImage(image, auth.deviceId, 'jpg')
		await apiRequest('POST', '/users/images/pending', {
			deviceId: auth.deviceId,
			auth,
			body: { image_id: uploaded.id }
		})
		await apiRequest('POST', '/users', {
			deviceId: auth.deviceId,
			auth,
			body: userPayload(identity, { avatar_image_id: uploaded.id, avatar_url: null })
		})
	}

	async function deletePost(userKey, postSeq, auth) {
		requireAuth(auth)
		return apiRequest('POST', `/board/legacy-write/posts/${postSeq}/delete`, {
			deviceId: auth.deviceId,
			auth,
			body: { request_id: requestId() }
		})
	}

	return {
		getNewMemo,
		getArticleList,
		getArticleDetail,
		getArticleReplies,
		getArticleAuthorId,
		getUserInfo,
		changeNickname,
		writeReply,
		votePost,
		deleteReply,
		writePost,
		changeIcon,
		deletePost,
		blockUser,
		listBlocks,
		unblock,
		setFixedImage,
		clearFixedImage,
		listNotifications,
		readNotification,
		listMemoThreads,
		getMemoThread,
		sendMemo,
		unreadCounts,
		loginSession,
		restoreSession,
		logout,
		uploadImage,
		socketAuth,
		attachSocket
	}
}

module.exports = {
	createLolWikiClient,
	normalizeListPost,
	normalizeDetailPost,
	normalizeComment,
	normalizeUser,
	responseMessage,
	requestId,
	constants: {
		API_BASE_URL,
		IMAGE_UPLOAD_URL,
		APP_VERSION,
		APP_BUILD,
		GUEST_DEVICE_ID
	}
}
