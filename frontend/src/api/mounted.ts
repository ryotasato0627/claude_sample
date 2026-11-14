import { useEffect, useRef } from "react";

// 呼び出したコンポーネントが表示中かを返す。
// useMutation のオプションの onSuccess は、コンポーネントが外れた後も呼ばれる。
// 画面の移動など、表示中にだけ行う処理の判定に使う。
export function useMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
