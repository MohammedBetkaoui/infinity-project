import { createContext, useContext } from 'react'

export const AnimationContext = createContext(null)
export const useAnimationContext = () => useContext(AnimationContext)
