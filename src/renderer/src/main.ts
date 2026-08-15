import { mount } from 'svelte'
import './styles/global.css'
// Side-effect import: connects the session client to the bridge before mount.
import '$lib/session'
import App from './App.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('renderer: #app mount point missing')

export default mount(App, { target })
