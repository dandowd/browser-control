import puppeteer, { Browser, Page } from "puppeteer";
import { WebSocketServer } from "ws";

const openPages: Record<string, Page> = {};

let b: Browser;
(async () => {
  // I don't want to make sure the browser has successfully launched on every
  // call, so I'm going with this hack. I think it's alright for the program to
  // crash if something goes wrong
  b = await puppeteer.launch({
    browser: "firefox",
    headless: false,
  });

  const pages = await b.pages();
  openPages["default"] = pages[0];
})();

type GetHtml = {
  message: "get_html";
  pageId: string;
};

type CreatePage = {
  message: "create_page";
  pageId: string;
};

type InputText = {
  pageId: string;
  message: "input_text";
  selector: string;
  text: string;
  enter?: boolean;
};

type Navigate = {
  pageId: string;
  message: "navigate";
  url: string;
};

type Click = {
  pageId: string;
  message: "click";
  selector: string;
};

type GetScreenshot = {
  pageId: string;
  message: "get_screenshot";
};

type Message =
  | CreatePage
  | InputText
  | GetHtml
  | Navigate
  | Click
  | GetScreenshot;

const click = async (message: Click) => {
  const { pageId, selector } = message;
  const page = openPages[pageId];

  try {
    await page.click(selector);
    return { success: true };
  } catch (err) {
    console.error(err);
    return {
      error: "Error while executing click",
    };
  }
};

const inputText = async (message: InputText) => {
  const { pageId, selector, text, enter } = message;
  const page = openPages[pageId];

  try {
    await page.type(selector, text, { delay: 100 });
    if (enter) {
      await page.keyboard.press("Enter");
    }
  } catch (err) {
    console.error(err);
    return {
      error: "Error while typing",
    };
  }
};

const getHtml = (message: GetHtml) => {
  const page = openPages[message.pageId];

  return page.content();
};

const createPage = async (message: CreatePage) => {
  if (openPages[message.pageId]) {
    return {
      error: "Page already exists",
    };
  }

  const page = await b.newPage();
  openPages[message.pageId] = page;
};

const navigate = async (message: Navigate) => {
  const { pageId, url } = message;
  const page = openPages[pageId];

  try {
    await page.goto(url);
    const html = await page.content();

    return {
      html,
    };
  } catch (err) {
    console.error(err);
    return {
      error: "Error while navigating",
    };
  }
};

const getScreenshot = async (message: GetScreenshot) => {
  const page = openPages[message.pageId];
  try {
    const data = await page.screenshot({ encoding: "base64" });
    return {
      screenshot: data,
    };
  } catch (err) {
    console.error(err);
    return {
      error: "Error while taking screenshot",
    };
  }
};

const messageSwitch = async (req: Message) => {
  const page = openPages[req.pageId];
  if (!page) {
    return { error: "Page with requested pageId not found" };
  }
  switch (req.message) {
    case "get_screenshot":
      return getScreenshot(req);
    case "create_page":
      return createPage(req);
    case "navigate":
      return navigate(req);
    case "get_html":
      return getHtml(req);
    case "click":
      return click(req);
    case "input_text":
      return inputText(req);
    default:
      return { error: "No message found" };
  }
};

const wss = new WebSocketServer({ port: 8080 });
wss.on("listening", () => {
  console.log("wss listening on 8080");
});
wss.on("error", (err) => {
  console.error(err);
});

wss.on("connection", (socket, request) => {
  console.log("client connecting");
  if (b) {
    socket.send(JSON.stringify({ messge: "browser_status", status: "up" }));
  } else {
    socket.send(JSON.stringify({ messge: "browser_status", status: "down" }));
  }

  socket.on("open", () => {
    console.log("socket open");
  });

  socket.on("close", () => {
    console.log("socket closed");
  });

  socket.on("message", (data) => {
    try {
      const req = JSON.parse(data.toString());
      console.log(req);

      messageSwitch(req).then((res) => {
        socket.send(JSON.stringify(res));
      });
    } catch (err) {
      console.error("Could not parse input");
      // All other error handling should happen lower down, so the only item throwing is the JSON.parse
      socket.send(JSON.stringify({ error: "Error while parsing JSON" }));
    }
  });
});

wss.on("close", () => {
  console.log("client disconnecting");
});
