import puppeteer, { Browser, Page } from "puppeteer";
import { WebSocketServer } from "ws";

const openPages: Record<string, Page> = {};

let b: Browser;
(async () => {
  // I don't want to make sure the browser has successfully launched on every call, so I'm going with this hack.
  // I think it's alright for the program to crash if something goes wrong
  b = await puppeteer.launch({
    browser: "firefox",
    headless: false,
  });
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

type Message = CreatePage | InputText | GetHtml | Navigate | Click;

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

  if (!page) {
    return {
      error: "Page with requested pageId not found",
    };
  }

  try {
    const res = await page.goto(url);
    const html = await res?.text();

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

const messageSwitch = async (req: Message) => {
  switch (req.message) {
    case "create_page":
      return createPage(req);
    case "navigate":
      return navigate(req);
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
  socket.on("open", () => {
    console.log("socket open");
  });

  socket.on("close", () => {
    console.log("socket closed");
  });

  socket.on("message", (data) => {
    const req = JSON.parse(data.toString());
    console.log(req);
    messageSwitch(req).then((res) => {
      socket.send(JSON.stringify(res));
    });
  });
});

wss.on("close", () => {
  console.log("client disconnecting");
});
