'use client';

import { motion, useReducedMotion } from 'motion/react';
import React, {
    ComponentPropsWithoutRef,
    createContext,
    useContext,
} from 'react';

// 連動させてFadeInするかどうかのコンテキスト
const StaggerContext = createContext(false);
// スクロールに合わせて表示するためのViewportの設定
const viewport = { once: true, margin: '0px 0px -100px' };

// FadeInコンポーネント
export function FadeIn(props: ComponentPropsWithoutRef<typeof motion.div>) {
    // アニメーションを減らすかどうか
    const shouldReduceMotion = useReducedMotion();

    // 連動させてFadeInするかどうか
    const isStagger = useContext(StaggerContext);

    return (
        <motion.div
            // アニメーションの設定
            transition={{
                duration: 0.5,
            }}
            // アニメーションのバリエーション
            variants={{
                hidden: {
                    opacity: 0,
                    y: shouldReduceMotion ? 0 : 20,
                },
                visible: {
                    opacity: 1,
                    y: 0,
                },
            }}
            // 連動させない場合は、初期状態をhiddenにして、スクロールに合わせて表示する
            {...(isStagger
                ? {}
                : {
                    initial: 'hidden',
                    whileInView: 'visible',
                    viewport,
                })}
            {...props}
        />
    );
}

// 連続して要素をFadeInするために上記のコンポーネントをラップするコンポーネント
export function FadeInWithStagger({
    slow = false,
    speed,
    ...props
}: ComponentPropsWithoutRef<typeof motion.div> & {
    slow?: boolean;
    speed?: number;
}) {
    return (
        <StaggerContext.Provider value={true}>
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                // 子要素に対してのアニメーションの設定
                transition={{
                    staggerChildren: speed ?? (slow ? 0.2 : 0.1),
                }}
                {...props}
            />
        </StaggerContext.Provider>
    );
}
