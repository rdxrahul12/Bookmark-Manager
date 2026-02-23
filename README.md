# 🚀 Bookmark Manager by  R D x

Hey there! Thanks for checking out **Bookmark Delight**. This is a modern, speedy, and beautiful way to manage your bookmarks right inside your browser. 

I've put together a few simple paths for you depending on whether you just want to test it out quickly, or if you're ready to use it as a full Chrome Extension!

---

## 🌐 1. Try It Out (Web Version)

If you just want to see what the interface looks like and play around with the features, the easiest way is to visit the live website:

👉 **[Click here to test Bookmark Delight](https://bm2-0.vercel.app/)**

**What you can do here:**
- See the beautiful animations in action.
- Add categories and drag-and-drop links.
- Play with the light and dark themes.
- Note: Since it's a website, the "Save Session" feature won't work perfectly (it needs extension permissions to see your tabs), and your data will only be saved locally in that specific browser tab.

---

## 🧩 2. Install it as a Chrome Extension (Recommended)

To get the full experience—including the ability to open the dash on every new tab, and the magical "Save Session" button that grabs all your open tabs—you'll want to install it directly into your Chrome browser. 

Here is the exact step-by-step process:

### Step A: Download the Code
1. Scroll to the top of this GitHub page.
2. Click the green **"<> Code"** button.
3. Click **"Download ZIP"**.
4. Once it downloads, **Extract** (unzip) the folder somewhere on your computer (like your Desktop or Documents folder). Let's say you extracted it to `bookmark-delight-main`.

### Step B: Build the Extension
*Disclaimer: You'll need [Node.js](https://nodejs.org/) installed on your computer for this part.*
1. Open up your computer's terminal (Command Prompt on Windows, Terminal on Mac).
2. Type `cd ` (with a space) and then drag your unzipped `bookmark-delight-main` folder into the terminal, then press **Enter**. This puts you inside the project folder.
3. Type `npm install` and press **Enter**. Wait a minute for it to download the necessary pieces.
4. Type `npm run build` and press **Enter**. 
   > 🎉 **Success!** This will create a new folder called `dist` inside your project directory. This `dist` folder is your shiny new extension!

### Step C: Load it into Chrome
1. Open Google Chrome.
2. In the URL bar at the top, type `chrome://extensions/` and hit **Enter**.
3. Look at the top right corner of the page and turn **ON** the switch that says **"Developer mode"**.
4. Now, look at the top left and click the button that says **"Load unpacked"**.
5. A file browser will pop up. Navigate to the `bookmark-delight-main` folder, select the new **`dist`** folder inside it, and click Select Folder.

**That's it!** 🎉 
Bookmark Delight is now installed. Open a new tab in Chrome, and you should immediately be greeted by your beautiful new bookmark manager. Enjoy!
