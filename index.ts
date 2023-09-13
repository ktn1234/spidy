import { load } from "cheerio";
import { parse } from "url";
import { basename } from "path";

const seenUrls: Set<string> = new Set<string>();
const errorUrls: Set<string> = new Set<string>();
const seenImageUrls: Set<string> = new Set<string>();

function normalizeUrl(link: string, host: string, protocol: string): string {
  if (link.includes("http")) return link;
  else if (link.startsWith("/")) return `${protocol}//${host}${link}`;
  else return `${protocol}//${host}/${link}`;
}

async function downloadImages(
  imageLinks: string[],
  host: string,
  protocol: string
) {
  const IMAGE_EXT = ["jpg", "jpeg", "png", "gif"];

  for (let i = 0; i < imageLinks.length; i++) {
    const imageLink = imageLinks[i];
    const imageUrl = normalizeUrl(imageLink, host, protocol);

    const filename = basename(imageUrl);
    const ext = filename.split(".").pop();

    if (!ext || !IMAGE_EXT.includes(ext)) continue;

    let imageUrlRef = filename;
    if (seenImageUrls.has(imageUrlRef)) {
      const filenameWithoutExt = imageUrlRef.replace(`.${ext}`, "");
      imageUrlRef = `${imageUrlRef.replace(
        filenameWithoutExt,
        `${filenameWithoutExt}-${Date.now()}`
      )}`;
    }

    console.log("Downloading Image:", filename, "as", imageUrlRef);
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(`./images/${imageUrlRef}`, arrayBuffer);
    seenImageUrls.add(imageUrlRef);
  }
}

async function crawl({ url, ignore }: { url: string; ignore?: string }) {
  if (seenUrls.has(url)) return;

  console.log("Crawling", url);
  seenUrls.add(url);

  const { host, protocol } = parse(url);
  if (!host || !protocol) return;

  try {
    const response = await fetch(url);
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
    console.error(`Error: Crawling ${url}`);
    errorUrls.add(url);
  }
}

async function main() {
  await crawl({ url: "https://github.com/" });
  await Promise.all([
    Bun.write("./seenUrls.json", JSON.stringify([...seenUrls], null, 2)),
    Bun.write("./errorUrls.json", JSON.stringify([...errorUrls], null, 2)),
    Bun.write(
      "./seenImageUrls.json",
      JSON.stringify([...seenImageUrls], null, 2)
    ),
  ]);
}

await main();
console.log("Done");
