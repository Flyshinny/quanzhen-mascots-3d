# 全真道院吉祥物 3D 介紹

以 [three.js](https://threejs.org/) 製作的吉祥物 3D 角色介紹頁：全全、真真、忠忠、瑞瑞、恕恕。

- 紅磚圓形舞台＋綠欄杆，角色以立牌式 3D 厚度呈現，可旋轉、點選
- 點選角色、拖曳旋轉、鍵盤 ← → 或下方按鈕切換；閒置會自動輪播
- 手機版自動改為下方資訊卡

## 3D 人物模型
`characters.html`：五位吉祥物以 three.js 幾何建模（卡通著色＋描邊），可旋轉，並切換立體／正面／側面／上方／五位合照視角，也能下載 PNG。
`renders/` 內有輸出好的 3D 人物圖、正面圖與五位合照（透明背景）。

## 動作與表情（給影片用）
`poses.html`：選角色後點動作、姿勢或表情即時預覽。五位都有相同的關節（頭、上半身、雙手、雙腳）與表情控制，清單在 `poses.js`。

- 表情 12 種：微笑、開心、大笑、眨眼、驚訝、害羞、難過、生氣、想睡、愛心眼、思考、安詳
- 定格姿勢 17 種：招牌姿勢、站好、揮手、歡呼、歡迎、合十、鞠躬、指向前方、思考、害羞、嚇一跳、失落、生氣跺腳、想睡覺、比愛心、奔跑、跳起來
- 循環動作 16 種：待機呼吸、揮手、歡呼跳躍、拍手、走路、奔跑、原地跳、點頭、搖頭、鞠躬、跳舞、轉圈、合十祈福、思考、說話、打瞌睡

```js
import { buildMascot3D } from './mascots3d.js';
import { setPose, playAction, setExpression } from './poses.js';
const mascot = buildMascot3D('ruirui');      // 加進場景
const rig = mascot.userData.rig;
setPose(rig, 'cheer');                       // 定格姿勢（會帶入預設表情）
setExpression(rig, 'surprised');             // 換表情
playAction(rig, 'wave', t);                  // 每一格呼叫，t＝秒數，自動循環、自動眨眼
rig.face.talk(0.8);                          // 說話嘴型 0～1（可接音量）
```
`renders/姿勢/`（900×1100）與 `renders/表情/`（640×640）是輸出好的透明背景 PNG。
重新輸出：`poses.html?export=<存檔伺服器>&what=poses` 或 `&what=expr`。

## 修改文字
角色名稱、介紹、標語都在 `data.js` 的 `MASCOTS` 陣列；3D 模型在 `mascots3d.js`。

## 本機預覽
```bash
python -m http.server 8765
```
開啟 http://localhost:8765
