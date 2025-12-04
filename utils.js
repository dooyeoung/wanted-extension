// --- 유틸리티 함수 ---
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCompanyName(text) {
    const nameDict = {
        "쿠팡": "COUPANG",
        // Add more mappings here if needed
        "씨제이이엔엠(CJ ENM)": "CJ ENM",
        "씨제이올리브영(CJ올리브영)": "CJ올리브영",
        "무신사페이먼츠": "무신사",
    };

    if (nameDict[text]) {
        return nameDict[text];
    }

    return text.replace(/\s*\(.*?\)/g, '');
}
