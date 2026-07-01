import reactLogo from './assets/react.svg'
import { PixiPainter } from './Canvas'
import './App.css'

function App() {
  return (
    <>
      <div className="flex items-center justify-center">
        <a href="https://github.com/YunYouJun/saier" target="_blank">
          <div className="logo pixi-painter i-ri-artboard-2-line" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Saier + React</h1>
      <input />
      <div className="card">
        <PixiPainter />
      </div>
    </>
  )
}

export default App
