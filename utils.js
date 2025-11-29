// --- 유틸리티 함수 ---
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCompanyName(text) {
    return text.replace(/\s*\(.*?\)/g, '');
}
