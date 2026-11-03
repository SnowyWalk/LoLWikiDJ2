/**
 * 레거시 화면(legacy/dj.html)에 붙인 클라이언트 기능을 브라우저로 확인한다.
 *   TEST_URL=http://localhost:3000 npx tsx --test tests/e2e/client-features.test.ts
 * Playwright 브라우저를 받지 않았으면 설치된 크롬을 쓴다: CHROME_PATH=/usr/bin/google-chrome
 * (로그인 없이 돈다: 로그인 창을 숨기고 메시지는 add_message 로 바로 그리며, 서버로 보내는 socket.emit 은 가로채 기록만 한다)
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

const URL_ = process.env.TEST_URL ?? "http://localhost:3000";

let browser: Browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => {
  await browser?.close();
});

/** 새 창(빈 localStorage)으로 열고 로그인 창을 숨긴다. 부드러운 스크롤은 꺼서 scrollDown 이 바로 끝나게 */
async function open(options: BrowserContextOptions = {}, init?: () => void): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: "reduce", ...options });
  const page = await context.newPage();
  // tsx 가 함수 이름을 남기려고 넣는 __name(...) 이 브라우저로 넘긴 함수 안에도 들어가므로, 페이지에도 같은 이름을 만들어 둔다
  await page.addInitScript("window.__name = (f) => f");
  if (init) await page.addInitScript(init);
  await page.goto(URL_, { waitUntil: "load" });
  await page.evaluate(() => {
    for (const id of ["init_block", "login_bg", "login_port", "login_id", "login_pw", "login_button", "login_remember_nick_holder"])
      document.getElementById(id)?.style.setProperty("display", "none");
  });
  return page;
}

const MOBILE: BrowserContextOptions = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true };

/** 채팅 n 개를 바로 그린다. name 을 안 주면 3명이 번갈아 (같은 사람이 이어지면 continued 묶음이 된다) */
function addMessages(page: Page, count: number, name?: string, from = 0) {
  return page.evaluate(
    ({ count, name, from }) => {
      for (let i = from; i < from + count; i++)
        add_message({ type: "message", name: name ?? "u" + (i % 3), message: "msg " + i, icon_id: 0, icon_ver: 0 });
    },
    { count, name, from },
  );
}

const chatCount = (page: Page) => page.evaluate(() => chat.children.length);

describe("오래된 채팅 자동 삭제", () => {
  test("설정 개수를 넘으면 위에서부터 지운다", async () => {
    const page = await open();
    await page.evaluate(() => set_chat_auto_trim(200));
    await addMessages(page, 250);
    assert.equal(await chatCount(page), 200);
    assert.match(await page.evaluate(() => chat.firstElementChild!.textContent!), /msg 50\b/);
    assert.equal(await page.evaluate(() => localStorage.getItem("option_chat_auto_trim")), "200");
    assert.equal(await page.evaluate(() => (document.getElementById("chat_auto_trim_200") as HTMLInputElement).checked), true);
    await page.context().close();
  });

  test("위로 올려 읽는 중에는 지우지 않고, 맨 아래로 돌아온 뒤 새 채팅이 오면 지운다", async () => {
    const page = await open();
    await addMessages(page, 250);
    await page.evaluate(() => {
      chat.scrollTop = 0;
      set_chat_auto_trim(200); // 맨 아래가 아니므로 바로 지우지 않는다
    });
    assert.equal(await chatCount(page), 250);
    await addMessages(page, 1, undefined, 250);
    assert.equal(await chatCount(page), 251);

    await page.evaluate(() => (chat.scrollTop = chat.scrollHeight));
    await addMessages(page, 1, undefined, 251);
    assert.equal(await chatCount(page), 200);
    await page.context().close();
  });

  test("묶음의 첫 메시지가 지워지면 남은 첫 메시지에 이름·아바타를 다시 보인다", async () => {
    const page = await open();
    await page.evaluate(() => set_chat_auto_trim(200));
    await addMessages(page, 201, "same");
    const [first, second] = await page.evaluate(() => [chat.children[0].hasAttribute("continued"), chat.children[1].hasAttribute("continued")]);
    assert.equal(first, false);
    assert.equal(second, true);
    await page.context().close();
  });

  test("끄기(기본값)면 지우지 않는다", async () => {
    const page = await open();
    await addMessages(page, 300);
    assert.equal(await chatCount(page), 300);
    await page.context().close();
  });
});

describe("모든 채팅을 TTS 로 보내기", () => {
  /** 로그인한 것처럼 두고 socket.emit 을 가로챈다. 입력창에 text 를 넣고 send() 한 뒤
     서버로 보낸 채팅과 TTS 요청(/tts 로 보내면 send 가 /tts 를 떼고 'tts' 이벤트를 따로 보낸다)을 돌려준다 */
  async function sendText(page: Page, text: string): Promise<{ chat?: string; tts?: string }> {
    return page.evaluate((text) => {
      const w = window as unknown as { __sent: [string, { message?: string; text?: string }][] };
      if (!w.__sent) {
        w.__sent = [];
        g_isLogin = true;
        socket.emit = ((event: string, data: { message?: string; text?: string }) => {
          w.__sent.push([event, data]);
          return socket;
        }) as typeof socket.emit;
      }
      w.__sent.length = 0;
      g_last_tts = 0; // TTS 는 1초에 한 번만 보내므로 연달아 보내도 되게
      chat_input.value = text;
      send();
      const find = (name: string) => w.__sent.find(([event]) => event === name)?.[1];
      return { chat: find("chat_message")?.message, tts: find("tts")?.text };
    }, text);
  }

  async function setAlways(page: Page, on: boolean) {
    await page.evaluate((on) => {
      option_checkbox_tts_always.checked = on;
      option_checkbox_tts_always.dispatchEvent(new Event("change"));
    }, on);
  }

  test("켜면 일반 채팅도 TTS 로 보내고, /명령어는 TTS 로 보내지 않는다", async () => {
    const page = await open();
    await page.waitForFunction(() => socket.connected);
    await setAlways(page, true);
    assert.equal(await page.evaluate(() => localStorage.getItem("option_checkbox_tts_always")), "true");

    assert.deepEqual(await sendText(page, "안녕하세요"), { chat: "안녕하세요", tts: "안녕하세요" });
    assert.deepEqual(await sendText(page, "/tts 직접 입력"), { chat: "직접 입력", tts: "직접 입력" });
    assert.deepEqual(await sendText(page, "/명령어 없음"), { chat: "/명령어 없음", tts: undefined });
    await page.context().close();
  });

  test("끄면(기본값) TTS 로 보내지 않는다", async () => {
    const page = await open();
    await page.waitForFunction(() => socket.connected);
    assert.equal(await page.evaluate(() => option_checkbox_tts_always.checked), false);
    assert.deepEqual(await sendText(page, "안녕하세요"), { chat: "안녕하세요", tts: undefined });
    await page.context().close();
  });

  test("설정은 새로고침해도 남는다", async () => {
    const page = await open();
    await setAlways(page, true);
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.evaluate(() => option_checkbox_tts_always.checked), true);
    await page.context().close();
  });
});

describe("데이터 절약 모드 (채팅 이미지)", () => {
  /** 테스트용 이미지 주소는 가짜 응답(1×1 png)으로 받고, 몇 번 요청됐는지 센다 */
  async function openWithImages() {
    const page = await open();
    const requested: string[] = [];
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    await page.route(/dezeolmo-test-/, (route) => {
      requested.push(route.request().url());
      return route.fulfill({ contentType: "image/png", body: png });
    });
    const addImage = (name: string) =>
      page.evaluate((name) => {
        add_message({ type: "message", name: "u", message: `/img https://example.com/dezeolmo-test-${name}.png`, icon_id: 0, icon_ver: 0 });
        const img = chat.lastElementChild!.querySelector("img.chat_img") as HTMLImageElement;
        img.id = "test_img_" + name;
        return { locked: img.classList.contains("dezeolmo_locked"), blank: img.src.startsWith("data:") };
      }, name);
    const requestsFor = (name: string) => requested.filter((u) => u.includes(`dezeolmo-test-${name}`)).length;
    return { page, addImage, requestsFor };
  }

  test("켜면 가려 두고 받지 않다가, 누르면 받는다", async () => {
    const { page, addImage, requestsFor } = await openWithImages();
    await page.evaluate(() => (option_checkbox_dezeolmo.checked = true));

    assert.deepEqual(await addImage("a"), { locked: true, blank: true });
    await page.waitForTimeout(300);
    assert.equal(requestsFor("a"), 0);

    // 가린 이미지는 마우스를 올려도 크게 보기를 띄우지 않는다
    await page.hover("#test_img_a");
    assert.equal(await page.evaluate(() => getComputedStyle(image_expander).display), "none");

    await page.click("#test_img_a");
    await page.waitForFunction(() => (document.getElementById("test_img_a") as HTMLImageElement).complete);
    assert.equal(requestsFor("a"), 1);
    assert.equal(await page.evaluate(() => document.getElementById("test_img_a")!.classList.contains("dezeolmo_locked")), false);
    await page.context().close();
  });

  test("한 번 연 주소는 다시 올라와도 가리지 않는다", async () => {
    const { page, addImage } = await openWithImages();
    await page.evaluate(() => (option_checkbox_dezeolmo.checked = true));
    await addImage("b");
    await page.click("#test_img_b");
    assert.deepEqual(await addImage("b"), { locked: false, blank: false });
    await page.context().close();
  });

  test("끄면 바로 받는다", async () => {
    const { page, addImage, requestsFor } = await openWithImages();
    assert.deepEqual(await addImage("c"), { locked: false, blank: false });
    await page.waitForFunction(() => (document.getElementById("test_img_c") as HTMLImageElement).complete);
    assert.equal(requestsFor("c"), 1);
    await page.context().close();
  });
});

describe("영상 전체화면", () => {
  const state = (page: Page) =>
    page.evaluate(() => ({
      on: document.documentElement.hasAttribute("video_fullscreen"),
      native: !!document.fullscreenElement,
      shield: getComputedStyle(video_fs_shield).display,
      toolbar: getComputedStyle(video_fs_toolbar).display,
      bottomBar: getComputedStyle(bottom_bar).display,
      history: history.state as { video_fullscreen?: boolean } | null,
    }));

  test("PC: 브라우저 전체화면으로 들어가고, 나가기 버튼으로 원래대로", async () => {
    const page = await open();
    await page.click("#video_info_fullscreen_btn");
    await page.waitForFunction(() => !!document.fullscreenElement);
    let s = await state(page);
    assert.equal(s.on, true);
    assert.equal(s.native, true);
    assert.equal(s.shield, "block");
    assert.equal(s.toolbar, "flex");
    assert.equal(s.bottomBar, "none");

    await page.click("#video_fs_exit_btn");
    await page.waitForFunction(() => !document.fullscreenElement);
    s = await state(page);
    assert.equal(s.on, false);
    assert.equal(s.shield, "none");
    assert.equal(s.toolbar, "none");
    assert.notEqual(s.bottomBar, "none");
    await page.context().close();
  });

  test("Esc·브라우저 메뉴로 전체화면이 풀리면 같이 끈다", async () => {
    const page = await open();
    await page.click("#video_info_fullscreen_btn");
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.documentElement.hasAttribute("video_fullscreen"));
    await page.context().close();
  });

  test("들어가면 재생목록 패널을 닫고 채팅 탭으로 바꾼다", async () => {
    const page = await open();
    await page.evaluate(() => {
      show_playlist_control_panel(true);
      set_chat_category(mainchat_header_option);
    });
    await page.click("#video_info_fullscreen_btn");
    assert.equal(await page.evaluate(() => g_show_playlist_control_panel), false);
    assert.equal(await page.evaluate(() => getComputedStyle(chat).display), "block");
    await page.context().close();
  });

  test("채팅 숨기기/보이기", async () => {
    const page = await open();
    await page.click("#video_info_fullscreen_btn");
    await page.click("#video_fs_chat_btn");
    assert.equal(await page.evaluate(() => getComputedStyle(mainchat).visibility), "hidden");
    assert.equal(await page.evaluate(() => [video_fs_chat_btn.hasAttribute("off"), video_fs_chat_btn.title].join()), "true,채팅 보이기");
    await page.click("#video_fs_chat_btn");
    assert.equal(await page.evaluate(() => getComputedStyle(mainchat).visibility), "visible");
    await page.context().close();
  });

  describe("전체화면을 지원하지 않는 브라우저 (아이폰 사파리)", () => {
    const noFullscreenApi = () => {
      Object.defineProperty(Document.prototype, "fullscreenEnabled", { get: () => false });
      Object.defineProperty(Document.prototype, "webkitFullscreenEnabled", { get: () => false });
    };

    test("화면 채우기로 들어가고, 뒤로 가기는 사이트를 떠나지 않고 전체화면만 끈다", async () => {
      const page = await open(MOBILE, noFullscreenApi);
      const url = page.url();
      await page.tap("#video_info_fullscreen_btn");
      const s = await state(page);
      assert.equal(s.on, true);
      assert.equal(s.native, false);
      assert.equal(s.history?.video_fullscreen, true);

      await page.goBack();
      await page.waitForFunction(() => !document.documentElement.hasAttribute("video_fullscreen"));
      assert.equal(page.url(), url);
      await page.context().close();
    });

    test("나가기 버튼으로 끄면 들어갈 때 쌓은 뒤로 가기 기록도 지운다", async () => {
      const page = await open(MOBILE, noFullscreenApi);
      const length = await page.evaluate(() => history.length);
      await page.tap("#video_info_fullscreen_btn");
      assert.equal(await page.evaluate(() => history.length), length + 1);
      await page.tap("#video_fs_exit_btn");
      await page.waitForFunction(() => history.state === null);
      assert.equal((await state(page)).on, false);
      await page.context().close();
    });
  });

  describe("모바일 키보드 (가짜 visualViewport)", () => {
    // 키보드가 올라온 것처럼 보이는 영역만 바꾼다: pan 이면 브라우저가 입력창을 보이려고 아래로 민 경우
    const fakeVisualViewport = () => {
      const vv = new EventTarget() as EventTarget & { offsetTop: number; height: number; scale: number };
      vv.offsetTop = 0;
      vv.height = innerHeight;
      vv.scale = 1;
      Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
      (window as unknown as { __keyboard: (h: number, pan: boolean) => void }).__keyboard = (h, pan) => {
        vv.height = innerHeight - h;
        vv.offsetTop = pan ? h : 0;
        vv.dispatchEvent(new Event("resize"));
      };
    };
    const keyboard = (page: Page, h: number, pan: boolean) =>
      page.evaluate(([h, pan]) => (window as unknown as { __keyboard: (h: number, pan: boolean) => void }).__keyboard(h as number, pan as boolean), [h, pan]);
    const rects = (page: Page) =>
      page.evaluate(() => {
        const r = (el: Element) => el.getBoundingClientRect();
        return { videoTop: r(video_player).top, chatTop: r(mainchat).top, chatBottom: r(mainchat).bottom, inputBottom: r(chat_input).bottom };
      });
    const KEYBOARD = 340;

    for (const pan of [false, true]) {
      test(`세로: 영상은 보이는 영역 맨 위, 채팅은 키보드 바로 위 (${pan ? "화면을 아래로 미는" : "보이는 영역만 줄이는"} 브라우저)`, async () => {
        const page = await open(MOBILE, fakeVisualViewport);
        await page.tap("#video_info_fullscreen_btn");
        await keyboard(page, 0, false); // 들어간 뒤 화면 크기로 맞춘다
        const visibleTop = pan ? KEYBOARD : 0;
        const visibleBottom = pan ? 915 : 915 - KEYBOARD;
        await keyboard(page, KEYBOARD, pan);
        const r = await rects(page);
        assert.equal(Math.round(r.videoTop), visibleTop);
        assert.equal(Math.round(r.chatBottom), visibleBottom);
        assert.ok(r.inputBottom <= visibleBottom);
        assert.ok(r.chatTop >= visibleTop);

        await keyboard(page, 0, false);
        const back = await rects(page);
        assert.equal(Math.round(back.videoTop), 0);
        assert.equal(Math.round(back.chatBottom), 915);
        await page.context().close();
      });
    }

    test("나가면 키보드 위치 변수를 지운다", async () => {
      const page = await open(MOBILE, fakeVisualViewport);
      await page.tap("#video_info_fullscreen_btn");
      await keyboard(page, KEYBOARD, true);
      await page.tap("#video_fs_exit_btn");
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--fs-vv-top")), "");
      await page.context().close();
    });
  });
});

describe("재생목록 고르기 (모바일)", () => {
  const isOpen = (page: Page) => page.evaluate(() => playlist_control_panel.hasAttribute("picker_open"));

  test("이름줄을 누르면 펼치고 다시 누르면 접는다", async () => {
    const page = await open(MOBILE);
    await page.evaluate(() => show_playlist_control_panel(true));
    await page.evaluate(() => playlist_control_panel_playlist_info_name.click());
    assert.equal(await isOpen(page), true);
    await page.evaluate(() => playlist_control_panel_playlist_info_name.click());
    assert.equal(await isOpen(page), false);
    await page.context().close();
  });

  test("바깥을 누르면 접고, 그 클릭은 아래 요소로 넘기지 않는다", async () => {
    const page = await open(MOBILE);
    await page.evaluate(() => show_playlist_control_panel(true));
    await page.evaluate(() => playlist_control_panel_playlist_info_name.click());
    const reached = await page.evaluate(() => {
      let reached = false;
      const target = playlist_control_panel_playlist_search_input;
      target.addEventListener("click", () => (reached = true));
      target.click();
      return reached;
    });
    assert.equal(await isOpen(page), false);
    assert.equal(reached, false);
    await page.context().close();
  });

  test("패널을 닫으면 접는다", async () => {
    const page = await open(MOBILE);
    await page.evaluate(() => {
      show_playlist_control_panel(true);
      playlist_picker_toggle(true);
      show_playlist_control_panel(false);
    });
    assert.equal(await isOpen(page), false);
    await page.context().close();
  });

  test("PC 에서는 이름줄을 눌러도 펼치지 않는다", async () => {
    const page = await open();
    await page.evaluate(() => {
      show_playlist_control_panel(true);
      playlist_control_panel_playlist_info_name.click();
    });
    assert.equal(await isOpen(page), false);
    await page.context().close();
  });
});

// 레거시 화면의 전역(id 로 잡히는 요소·함수)을 테스트 안에서 쓰기 위한 선언
declare global {
  const chat: HTMLDivElement;
  const chat_input: HTMLInputElement;
  const mainchat: HTMLDivElement;
  const bottom_bar: HTMLDivElement;
  const video_player: HTMLElement;
  const video_fs_shield: HTMLDivElement;
  const video_fs_toolbar: HTMLDivElement;
  const video_fs_chat_btn: HTMLDivElement;
  const image_expander: HTMLDivElement;
  const mainchat_header_option: HTMLElement;
  const playlist_control_panel: HTMLDivElement;
  const playlist_control_panel_playlist_info_name: HTMLDivElement;
  const playlist_control_panel_playlist_search_input: HTMLInputElement;
  const option_checkbox_tts_always: HTMLInputElement;
  const option_checkbox_dezeolmo: HTMLInputElement;
  const socket: { connected: boolean; emit: (event: string, data?: unknown) => unknown };
  var g_isLogin: boolean;
  var g_last_tts: number;
  const g_show_playlist_control_panel: boolean;
  function add_message(data: Record<string, unknown>): void;
  function set_chat_auto_trim(count: number): void;
  function send(force_tts?: boolean): void;
  function set_chat_category(el: HTMLElement): void;
  function show_playlist_control_panel(show: boolean): void;
  function playlist_picker_toggle(open?: boolean): void;
}
