# COMPROMISED TRACE

카메라로 두 손의 좌표를 추적하고 마이크 입력으로 그 궤적을 교란하는 웹 실험물입니다.
MediaPipe Tasks Vision의 HandLandmarker로 손을 인식하고, 인식된 좌표를 캔버스에
잔상으로 그립니다. 마이크 음량이 커질수록 화면에 글리치가 강하게 걸립니다.

## 구성

- `index.html` — 부팅 패널과 HUD, 캔버스 레이아웃
- `src/app.js` — 카메라·마이크 초기화, MediaPipe 연동, 렌더 루프
- `src/media-trace-core.js` — 손 궤적 누적, 속도 계산, 오디오 평활화 등 순수 로직
- `src/styles.css` — 터미널풍 스타일
- `test/media-trace-core.test.js` — 코어 로직 단위 테스트

렌더링과 무관한 계산 로직만 `media-trace-core.js`로 떼어 놓아서, 브라우저 없이
Node의 내장 테스트 러너로 검증할 수 있습니다.

## 의존성

MediaPipe Tasks Vision을 jsDelivr CDN에서 직접 불러오므로 별도 설치가 필요하지 않습니다.

## 실행

정적 파일이라 아무 정적 서버로나 띄우면 됩니다. 카메라와 마이크 권한이 필요하므로
`file://`로는 동작하지 않습니다.

```bash
npx serve .      # 또는 python -m http.server
npm test         # 코어 로직 테스트
npm run check    # 문법 검사
```
