# Modelos do F4C3 SC4N

Rodam no navegador com onnxruntime-web (`js/face-scan/worker.js`). Todos têm licença que permite redistribuição.

| Arquivo | Função | Origem | Licença | SHA-256 |
|---|---|---|---|---|
| `yunet_2023mar.onnx` | detecção de rosto + 5 pontos | [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) | MIT | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |
| `yolox_nano.onnx` | detecção de pessoa (COCO) | [Megvii YOLOX 0.1.1rc0](https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0) | Apache 2.0 | `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d` |
| `sface_2021dec_int8.onnx` | embedding de identidade | [OpenCV Zoo](https://huggingface.co/opencv/face_recognition_sface) | Apache 2.0 | `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a` |

Entradas fixas: YuNet 640×640 (BGR, 0–255), YOLOX-nano 416×416 (BGR, 0–255, pad 114), SFace 112×112 (RGB, 0–255, rosto alinhado pelos 5 pontos).
