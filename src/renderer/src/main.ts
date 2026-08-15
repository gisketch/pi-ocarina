import { mount } from 'svelte'
import './styles/global.css'
import App from './App.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('renderer: #app mount point missing')

export default mount(App, { target })
