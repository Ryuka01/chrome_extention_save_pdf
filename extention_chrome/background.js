// アイコンクリック時に実行されるイベントリスナー
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    // ページを一番下までスクロール
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrollToBottom
    }, async () => {
      // スクロール完了後、10秒待つ
      setTimeout(async () => {
        // 10秒後にPDFを生成
        await generatePdf(tab.id);
      }, 10000); // 10秒 = 10000ミリ秒
    });
  }
});

// ページを一番下までスクロールする関数
function scrollToBottom() {
  window.scrollTo(0, document.body.scrollHeight);
}


// ページの全体高さを取得する関数
function getPageHeight(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        func: () => {
          return document.documentElement.scrollHeight;
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else {
          const [result] = results;
          resolve(result.result);
        }
      }
    );
  });
}

// ピクセルをインチに変換する関数（DPIは96と仮定）
function pixelsToInches(pixels, dpi = 96) {
  return pixels / dpi;
}

// エラーメッセージをユーザーに通知する関数
function showError(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'PDF保存エラー',
    message: message
  });
}

// 成功メッセージをユーザーに通知する関数
function showSuccess(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'PDF保存完了',
    message: message
  });
}

// PDFを生成し、ダウンロードする関数
async function generatePdf(tabId) {
  try {
    // ページの全体高さを取得
    const pageHeightPx = await getPageHeight(tabId);
    const dpi = 96; // デフォルトDPI
    const paperWidth = 8.27 * 2; // A4サイズの幅（インチ）
    const paperHeight = pixelsToInches(pageHeightPx, dpi);

    // chrome.debugger APIを使用してPDFを生成
    const debuggee = { tabId: tabId };

    // デバッガーをアタッチ
    chrome.debugger.attach(debuggee, "1.3", () => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        showError(chrome.runtime.lastError.message);
        return;
      }

      // Page.printToPDF コマンドのオプションを設定
      const printOptions = {
        printBackground: true,
        paperWidth: paperWidth, // A4サイズの幅
        paperHeight: paperHeight, // ページの高さに基づく高さ
        landscape: false,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
      };

      // ページ印刷コマンドを送信
      chrome.debugger.sendCommand(debuggee, "Page.printToPDF", printOptions, (result) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          showError(chrome.runtime.lastError.message);
          chrome.debugger.detach(debuggee);
          return;
        }

        const pdfData = result.data;
        // データURLを作成
        const url = 'data:application/pdf;base64,' + pdfData;

        // ファイル名を動的に生成（例: ページタイトルとタイムスタンプ）
        chrome.tabs.get(tabId, (tabInfo) => {
          const pageUrl = new URL(tabInfo.url);
          let sanitizedPath = pageUrl.pathname.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const host = pageUrl.hostname.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0'); // 月は0から始まるため+1
          const day = String(now.getDate()).padStart(2, '0');
          const timestamp = `${year}${month}${day}`;

          let filenameBase = `${host}${sanitizedPath}${timestamp}`;
          const maxFilenameLength = 100; // 最大ファイル名長（文字数）
          if (filenameBase.length > maxFilenameLength) {
            filenameBase = filenameBase.substring(0, maxFilenameLength);
          }
          const filename = `${filenameBase}.pdf`;

          // ダウンロードを実行
          chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
          }, (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError.message);
              showError(chrome.runtime.lastError.message);
            } else {
              showSuccess(`PDFがダウンロードされました: ${filename}`);
            }
            // デバッガーをデタッチ
            chrome.debugger.detach(debuggee);
          });
        });
      });
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    showError(error.toString());
  }
}
