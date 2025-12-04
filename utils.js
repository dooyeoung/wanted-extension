// --- 유틸리티 함수 ---
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCompanyName(text) {
    const name = text.replace(/\s*\(.*?\)/g, '');

    const nameDict = {
        "쿠팡": "COUPANG",
        // 필요한 경우 여기에 매핑 추가
        "씨제이이엔엠": "CJ ENM",
        "씨제이올리브영": "CJ올리브영",
        "무신사페이먼츠": "무신사",
        "당근서비스": "당근마켓",
        "넥슨코리아": "NEXON",
        "클래스101": "class101",
        "소크라에이아이": "뤼이드",
        "케이티밀리의서재": "밀리의서재",
        "매스프레소": "매스프레소(콴다)",

    };

    if (nameDict[name]) {
        return nameDict[name];
    }

    return name
}
