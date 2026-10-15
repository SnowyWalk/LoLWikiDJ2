'use strict'

const crypto = require('crypto')

const API_BASE_URL = 'https://lolwiki.kr/api/app/api/v1'
const IMAGE_UPLOAD_URL = 'https://img.lolwiki.kr/api/images'
const APP_VERSION = '2.0.3'
const APP_BUILD = '1784442393'
const GUEST_DEVICE_ID = 'LoLWikiDJ_Guest'
const BLOCK_CACHE_TTL_MS = 30 * 1000
const POST_CACHE_LIMIT = 1000

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

function displayDate(value) {
	return asString(value).replace('T', ' ')
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

function normalizeDetailPost(post, identity) {
	const imageUrls = normalizeImageUrls(post)
	const authorId = asString(firstValue(post, ['author_id'], ''))
	const identityKey = identity && asString(firstValue(identity, ['local_user_key', 'user_key', 'id'], ''))
	const isMine = Boolean(firstValue(post, ['is_mine', 'my_post'], false)) || Boolean(identityKey && authorId === identityKey)

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
				const recovered = await refreshAuth(options.auth, options.deviceId) || await loginAuth(options.auth, options.deviceId)
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

		const normalizedFormat = imageFormat === 'gif' ? 'gif' : 'jpg'
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
						contentType: normalizedFormat === 'gif' ? 'image/gif' : 'image/jpeg'
					}
				}
			},
			json: true,
			timeout: 30000
		}))
		const imageId = firstValue(response && response.data, ['id'], firstValue(response, ['image_id', 'id'], ''))
		if(!imageId)
			throw new Error('LoLWiki image upload did not return an image id')
		return { id: asString(imageId), format: normalizedFormat }
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
		if(typeof auth.onTokens === 'function')
			auth.onTokens(serializableAuth(auth))
		return user
	}

	async function getNewMemo(socket, userKey, auth) {
		if(!canRecoverAuth(auth))
			return false
		if(!auth.userKey)
			auth.userKey = userKey && userKey !== GUEST_DEVICE_ID ? userKey : ''
		if(!auth.userKey)
			auth.userKey = (await getUserInfo(auth)).local_user_key

		const response = await apiRequest('GET', '/memos', {
			deviceId: auth.deviceId,
			auth,
			query: { local_user_key: auth.userKey, limit: 20 }
		})
		const results = asArray(response && response.results)
		const hasUnread = Number(firstValue(response, ['unread_count'], 0)) > 0 || results.some(item => item.unread || Number(item.unread_count) > 0)
		if(hasUnread && socket)
			socket.emit('lol_get_new_memo')
		return hasUnread
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
		if(!viewerUserKey && requestAuth) {
			try {
				viewerUserKey = (await getUserInfo(auth)).local_user_key
			}
			catch(error) {
				if(mine || !error || error.statusCode !== 401)
					throw error
				requestAuth = null
			}
		}
		const pageKey = JSON.stringify({ targetUserKey, viewerUserKey, searchBody, searchNickname, popular, mine, numericLimit })
		let query = {
			mode: mine ? 'mine' : popular ? 'popular' : 'latest',
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
		if(mine)
			query.author_id = targetUserKey && targetUserKey !== GUEST_DEVICE_ID ? targetUserKey : viewerUserKey

		let response
		try {
			response = await apiRequest('GET', '/legacy-read-compat/posts', {
				deviceId: auth && auth.deviceId || GUEST_DEVICE_ID,
				auth: requestAuth,
				query
			})
		}
		catch(error) {
			if(mine || !requestAuth || !error || error.statusCode !== 401)
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
			? { local_user_key: viewerUserKey }
			: null
		const query = { post_seq: postSeq }
		if(identity && identity.local_user_key)
			query.viewer_id = identity.local_user_key

		const response = await apiRequest('GET', '/legacy-read-compat/post', {
			deviceId: auth && auth.deviceId || GUEST_DEVICE_ID,
			auth,
			query
		})
		const responsePost = firstValue(response, ['post', 'result'], null)
		const cachedPost = postCache.get(asString(postSeq))
		const post = responsePost ? Object.assign({}, cachedPost || {}, responsePost) : cachedPost
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

	async function changeNickname(userKey, nickname, auth) {
		requireAuth(auth)
		const identity = await getUserInfo(auth)
		try {
			await apiRequest('POST', '/users', {
				deviceId: auth.deviceId,
				auth,
				body: userPayload(identity, { nickname })
			})
			blockCache.delete(userKey || identity.local_user_key)
			return true
		}
		catch(error) {
			if(error && (error.statusCode === 400 || error.statusCode === 409 || error.statusCode === 422))
				return false
			throw error
		}
	}

	async function registerBoardImage(uploaded, userKey, auth) {
		if(!uploaded)
			return
		await withWriteStage('LOLWIKI_IMAGE_PENDING_FAILED', () => apiRequest('POST', '/board/legacy-write/images/pending', {
			deviceId: auth.deviceId,
			auth,
			body: { image_id: uploaded.id, image_format: uploaded.format }
		}))
	}

	async function writeReply(postSeq, userKey, body, image = '', auth) {
		requireAuth(auth)
		const uploaded = image ? await uploadImage(image, auth.deviceId, 'jpg') : null
		await registerBoardImage(uploaded, userKey, auth)
		return withWriteStage('LOLWIKI_COMMENT_WRITE_FAILED', () => apiRequest('POST', `/board/legacy-write/posts/${postSeq}/comments`, {
			deviceId: auth.deviceId,
			auth,
			body: {
				body,
				parent_id: 0,
				mention_user_id: '',
				image_id: uploaded ? uploaded.id : '',
				image_format: uploaded ? uploaded.format : '',
				request_id: requestId()
			}
		}))
	}

	async function votePost(postSeq, userKey, auth) {
		requireAuth(auth)
		const response = await apiRequest('POST', `/board/legacy-write/posts/${postSeq}/vote`, {
			deviceId: auth.deviceId,
			auth,
			body: { action: 'up' }
		})
		return Boolean(response && response.status === 'OK' && firstValue(response, ['vote', 'vote_state', 'post_vote'], 'up') !== 'neutral')
	}

	async function deleteReply(userKey, postSeq, replySeq, auth) {
		requireAuth(auth)
		return apiRequest('POST', `/board/legacy-write/posts/${postSeq}/comments/${replySeq}/delete`, {
			deviceId: auth.deviceId,
			auth,
			body: { request_id: requestId() }
		})
	}

	async function writePost(userKey, subject, body, youtubeUrl, image = '', isGif = false, auth) {
		requireAuth(auth)
		const uploaded = image ? await uploadImage(image, auth.deviceId, isGif ? 'gif' : 'jpg') : null
		await registerBoardImage(uploaded, userKey, auth)
		return withWriteStage('LOLWIKI_POST_WRITE_FAILED', () => apiRequest('POST', '/board/legacy-write/posts', {
			deviceId: auth.deviceId,
			auth,
			body: {
				title: subject,
				body,
				image_id: uploaded ? uploaded.id : '',
				image_format: uploaded ? uploaded.format : '',
				youtube_url: youtubeUrl || '',
				notice: false,
				request_id: requestId()
			}
		}))
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
	requestId,
	constants: {
		API_BASE_URL,
		IMAGE_UPLOAD_URL,
		APP_VERSION,
		APP_BUILD,
		GUEST_DEVICE_ID
	}
}
