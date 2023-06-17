import puppeteer from "puppeteer";

const TIME_FRAMES = {
    "ALL_TIME": 'all',
    "PAST_YEAR": 'year',
    "PAST_MONTH": 'month',
    "PAST_WEEK": 'week',
    "PAST_DAY": 'day',
    "PAST_HOUR": 'hour',
};

/**
 * @typedef {Object} PostData
 * 
 * @property {string} url
 * 
 * @property {string} title
 * @property {string} author
 * 
 * @property {string} body
 */

class Reddit {
    async open() {
        this.browser = await puppeteer.launch({
            headless: 'new',
        });
    }

    async close() {
        this.browser.close();
    }

    /**
     * Scrape a subreddit's top posts.
     * @param {string} subreddit The subreddit to scrape from.
     * @param {string} time_frame The time frame to scrape posts from.
     * @returns {Promise<PostData[]>}
     */
    async scrape_subreddit(subreddit, time_frame = TIME_FRAMES.ALL_TIME, count = 25) {

        // Open a new page
        let page = await this.browser.newPage();

        let promises = [];
        let url = `https://old.reddit.com/r/${subreddit}/top/?sort=top&t=${time_frame}`;

        // Begin scraping for posts
        scrape: while (true) {

            // Load page
            await page.goto(
                url, { waitUntil: 'networkidle0' },
            );

            // Get a list of all loaded posts
            let posts = await page.$$('#siteTable > div[class*="thing"]:not(.promoted)');

            // Iterate through posts
            for (let post of posts) {

                // Get post URL
                let post_url = await post.$eval(
                    'p[class*="title"] > .title',
                    node => node.href
                );

                // Begin scraping post
                promises.push(
                    this.scrape_post(post_url)
                );

                // If enough posts have been scraped, break
                if (promises.length == count) {
                    break scrape;
                }

            }

            // Get the next page of results
            url = await page.$eval('span[class*="next-button"] > a', node => node.href);
        }

        // Wait for all scapings to finish
        let post_data = await Promise.all(promises);

        await page.close();

        return post_data;
    }

    /**
     * Scrape a reddit post.
     * @param {string} url The URL of the post to scrape.
     * @returns {Promise<PostData>}
     */
    async scrape_post(url) {

        // Open a new page
        let page = await this.browser.newPage();

        // Load post page
        await page.goto(
            url, { waitUntil: 'networkidle0' }
        );

        // Get main post element
        let post_body = await page.$('div[class*="thing"]');

        // Fetch title
        let title = await post_body.$eval('.title > .title', node => node.innerText);

        // Fetch author
        let author;
        try {
            author = await post_body.$eval('.tagline > .author', node => node.innerText);
        } catch {
            author = '[deleted]';
        }

        // Fetch post content
        let body = await post_body.$eval('.usertext-body', node => node.innerText);

        // Close the page
        await page.close();

        return {
            url,
            title,
            author,
            body,
        };

    }
}

export { Reddit, TIME_FRAMES };
