import { createContext, useContext } from 'react'

export const ToastContext = createContext({
  success: () => {},
  error: () => {},
  info: () => {},
})

export const useToast = () => useContext(ToastContext)
