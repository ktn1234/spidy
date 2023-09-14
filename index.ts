import { load } from "cheerio";
import { parse } from "url";
import { basename } from "path";
import { mkdir, existsSync } from "fs";

const seenUrls: Set<string> = new Set<string>();
const errorUrls: Set<string> = new Set<string>();
const seenImageUrls: Record<string, string> = {};

const SEEN_URLS_PATH = `${import.meta.dir}/seenUrls.json`;
const ERROR_URLS_PATH = `${import.meta.dir}/errorUrls.json`;
const SEEN_IMAGE_URLS_PATH = `${import.meta.dir}/seenImageUrls.json`;

const IMAGES_DIR_PATH = `${import.meta.dir}/images`;
const IMAGE_EXT = ["jpg", "jpeg", "png"];

function normalizeUrl(link: string, host: string, protocol: string): string {
  if (link.includes("http")) return link;
  else if (link.startsWith("/")) return `${protocol}//${host}${link}`;
  else return `${protocol}//${host}/${link}`;
}

async function downloadImages(
  imageLinks: string[],
  host: string,
  protocol: string
): Promise<void> {
  for (let i = 0; i < imageLinks.length; i++) {
    const imageLink = imageLinks[i];
    const imageUrl = normalizeUrl(imageLink, host, protocol);

    const filename = basename(imageUrl);
    const ext = filename.split(".").pop();

    if (!ext || !IMAGE_EXT.includes(ext)) continue;

    let imageUrlRef = filename;
    if (seenImageUrls[imageUrlRef]) {
      const filenameWithoutExt = imageUrlRef.replace(`.${ext}`, "");
      imageUrlRef = `${imageUrlRef.replace(
        filenameWithoutExt,
        `${filenameWithoutExt}-${Date.now()}`
      )}`;
    }

    let arrayBuffer: ArrayBuffer;
    try {
      console.log("Downloading Image:", filename, "as", imageUrlRef);
      const response = await fetch(imageUrl, {
        tls: {
          rejectUnauthorized: false,
        },
      });

      if (response.status !== 200) {
        console.error(
          `Error: Downloading image ${imageUrl} as ${imageUrlRef} with status ${response.status}`
        );
        continue;
      }

      arrayBuffer = await response.arrayBuffer();
    } catch (e) {
      console.error(e);
      console.error(`Error: Downloading image ${imageUrl} as ${imageUrlRef}`);
      continue;
    }

    const filePath = `${IMAGES_DIR_PATH}/${imageUrlRef}`;
    try {
      if (!existsSync(IMAGES_DIR_PATH)) {
        mkdir(IMAGES_DIR_PATH, () => console.info("Created images directory"));
      }

      await Bun.write(filePath, arrayBuffer);
      seenImageUrls[imageUrlRef] = imageUrl;
    } catch (e) {
      console.error(e);
      console.error(
        `Error: Saving image ${imageUrl} as ${imageUrlRef} to ${filePath}`
      );
      continue;
    }
  }
}

async function crawl({
  url,
  ignore,
}: {
  url: string;
  ignore?: string;
}): Promise<void> {
  if (seenUrls.has(url)) return;

  console.log("Crawling", url);
  seenUrls.add(url);

  const { host, protocol } = parse(url);
  if (!host || !protocol) return;

  try {
    const response = await fetch(url, {
      tls: {
        rejectUnauthorized: false,
      },
    });

    if (response.status !== 200) {
      console.error(`Error: Crawling ${url} with status ${response.status}`);
      errorUrls.add(url);
      return;
    }

    const html = await response.text();

    const $ = load(html);
    const links = $("a")
      .map((_, link) => link.attribs.href)
      .get();

    const imageLinks = $("img")
      .map((_, link) => link.attribs.src)
      .get();

    await downloadImages(imageLinks, host, protocol);

    for (let i = 0; i < links.length; i++) {
      const link = links[i];

      const b = basename(link);
      if (!link.includes(host) || (ignore && b.includes(ignore))) continue;

      await crawl({
        url: normalizeUrl(link, host, protocol),
        ignore,
      });
    }
  } catch (e) {
    console.error(e);
    console.error(`Error: Crawling ${url}`);
    errorUrls.add(url);
  }
}

async function main(): Promise<void> {
  process.on("SIGINT", async () => {
    console.log(`\nSaving crawled websites history to ${SEEN_URLS_PATH}`);
    console.log(`Saving error urls history to ${ERROR_URLS_PATH}`);
    console.log(`Saving downloaded images history to ${SEEN_IMAGE_URLS_PATH}`);

    await Promise.all([
      Bun.write(SEEN_URLS_PATH, JSON.stringify([...seenUrls], null, 2)),
      Bun.write(ERROR_URLS_PATH, JSON.stringify([...errorUrls], null, 2)),
      Bun.write(SEEN_IMAGE_URLS_PATH, JSON.stringify(seenImageUrls, null, 2)),
    ]);

    console.log("Exiting process...");
    process.exit();
  });

  await crawl({ url: "https://google.com/" });
  await Promise.all([
    Bun.write(SEEN_URLS_PATH, JSON.stringify([...seenUrls], null, 2)),
    Bun.write(ERROR_URLS_PATH, JSON.stringify([...errorUrls], null, 2)),
    Bun.write(SEEN_IMAGE_URLS_PATH, JSON.stringify(seenImageUrls, null, 2)),
  ]);
  console.log("Done");
}

await main();
