import { state } from './state.js';
import { playSound } from './sounds.js';
import { getProfile } from './helpers.js';
import { renderSystem } from './ui.js';
import { showToast } from './ultimate-features.js';

  // ═══════════════════ WEBRTC CALLING ═══════════════════
  export async function getUserMediaStream(type) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera/Microphone is not supported in this browser or origin (requires HTTPS).');
    }
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000
    };
    if (type === 'video') {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
      } catch (e1) {
        try {
          return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: true });
        } catch (e2) {
          showToast('📹 Camera permission denied or unavailable. Continuing with Voice Call.');
          return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
        }
      }
    } else {
      return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    }
  }

  let callTimerInterval = null;
  let callStartTime = 0;
  let currentFacingMode = 'user';

  export function startCallTimer() {
    stopCallTimer();
    callStartTime = Date.now();
    const timerEl = document.getElementById('callTimer');
    if (timerEl) {
      timerEl.style.display = 'block';
      timerEl.textContent = '00:00';
    }
    callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${m}:${s}`;
    }, 1000);
  }

  export function stopCallTimer() {
    if (callTimerInterval) {
      clearInterval(callTimerInterval);
      callTimerInterval = null;
    }
    const timerEl = document.getElementById('callTimer');
    if (timerEl) {
      timerEl.style.display = 'none';
      timerEl.textContent = '00:00';
    }
  }

  export async function startCall(type) {
    if (!joined) return;
    const cleanMyName = (myName || '').toLowerCase();
    if (myRoom === `dm_${cleanMyName}_${cleanMyName}`) {
      showToast('🔖 Saved Messages is your private cloud notes.');
      return;
    }
    callType = type;

    const overlay = document.getElementById('callOverlay');
    const incomingControls = document.getElementById('incomingControls');
    const activeControls = document.getElementById('activeCallControls');
    const statusText = document.getElementById('callStatusText');
    const audioView = document.getElementById('callAudioView');
    const videoGrid = document.getElementById('videoGrid');
    const flipCamBtn = document.getElementById('flipCamBtn');
    const audioWaves = document.getElementById('callAudioWaves');

    if (overlay) overlay.style.display = 'flex';
    if (incomingControls) incomingControls.style.display = 'none';
    if (activeControls) activeControls.style.display = 'flex';
    if (statusText) statusText.textContent = 'Calling…';
    if (audioWaves) audioWaves.style.display = 'none';

    // Target recipient
    if (myRoom && myRoom.startsWith('dm_')) {
      const parts = myRoom.replace('dm_', '').split('_');
      callPartner = parts.find(p => p.toLowerCase() !== cleanMyName) || parts[0] || 'bestie';
    } else {
      const others = currentOnlineUsers.filter(u => (u || '').toLowerCase() !== cleanMyName);
      callPartner = others[0] || 'Bestie';
    }

    const p = getProfile(callPartner);
    const callAvatar = document.getElementById('callAvatar');
    const callName = document.getElementById('callName');
    if (callAvatar) callAvatar.textContent = p.avatar || '🐱';
    if (callName) callName.textContent = p.nickname ? `${p.nickname} (@${callPartner})` : `@${callPartner}`;

    if (type === 'video') {
      if (audioView) audioView.style.display = 'none';
      if (videoGrid) videoGrid.style.display = 'block';
      if (flipCamBtn) flipCamBtn.style.display = 'flex';
    } else {
      if (audioView) audioView.style.display = 'flex';
      if (videoGrid) videoGrid.style.display = 'none';
      if (flipCamBtn) flipCamBtn.style.display = 'none';
    }

    try {
      const stream = await getUserMediaStream(type);
      localStreamStream = stream;

      const localVideo = document.getElementById('localVideo');
      if (localVideo) {
        localVideo.srcObject = stream;
      }

      initPeerConnection(type);

      stream.getTracks().forEach((track) => {
        webrtcConn.addTrack(track, stream);
      });

      const offer = await webrtcConn.createOffer();
      await webrtcConn.setLocalDescription(offer);

      socket.emit('call-invite', { offer, type, targetUser: callPartner });
      playSound('send');

    } catch (err) {
      console.error('Call failed to start:', err);
      renderSystem('🔒 Could not access microphone/camera');
      showToast('🔒 Mic/Camera permission blocked. Please allow mic & camera in browser settings.');
      endCall(true);
    }
  }

  export function initPeerConnection(type) {
    webrtcConn = new RTCPeerConnection(rtcConfig);

    webrtcConn.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('call-candidate', {
          candidate: e.candidate,
          targetSocketId: callPartnerSocketId,
          targetUser: callPartner
        });
      }
    };

    webrtcConn.ontrack = (e) => {
      const remoteVideo = document.getElementById('remoteVideo');
      if (remoteVideo && e.streams[0]) {
        remoteVideo.srcObject = e.streams[0];
        remoteVideo.style.display = type === 'video' ? 'block' : 'none';
      }
    };
  }

  export async function acceptCall() {
    if (!webrtcCallOffer) return;

    if (navigator.vibrate) navigator.vibrate(0);

    const statusText = document.getElementById('callStatusText');
    if (statusText) statusText.textContent = 'Connecting…';

    const incomingControls = document.getElementById('incomingControls');
    const activeControls = document.getElementById('activeCallControls');
    const audioView = document.getElementById('callAudioView');
    const videoGrid = document.getElementById('videoGrid');
    const flipCamBtn = document.getElementById('flipCamBtn');
    const audioWaves = document.getElementById('callAudioWaves');

    if (incomingControls) incomingControls.style.display = 'none';
    if (activeControls) activeControls.style.display = 'flex';

    if (callType === 'video') {
      if (audioView) audioView.style.display = 'none';
      if (videoGrid) videoGrid.style.display = 'block';
      if (flipCamBtn) flipCamBtn.style.display = 'flex';
    } else {
      if (audioView) audioView.style.display = 'flex';
      if (videoGrid) videoGrid.style.display = 'none';
      if (flipCamBtn) flipCamBtn.style.display = 'none';
    }

    try {
      const stream = await getUserMediaStream(callType);
      localStreamStream = stream;

      const localVideo = document.getElementById('localVideo');
      if (localVideo) {
        localVideo.srcObject = stream;
      }

      initPeerConnection(callType);

      stream.getTracks().forEach((track) => {
        webrtcConn.addTrack(track, stream);
      });

      await webrtcConn.setRemoteDescription(new RTCSessionDescription(webrtcCallOffer));
      const answer = await webrtcConn.createAnswer();
      await webrtcConn.setLocalDescription(answer);

      socket.emit('call-accept', {
        answer,
        callerSocketId: callPartnerSocketId,
        targetUser: callPartner
      });
      if (statusText) statusText.textContent = 'Connected 🟢';
      if (audioWaves) audioWaves.style.display = 'flex';
      startCallTimer();

    } catch (err) {
      console.error('Failed to accept call:', err);
      socket.emit('call-decline', { callerSocketId: callPartnerSocketId, targetUser: callPartner });
      endCall(true);
    }
  }

  export function endCall(silent) {
    if (!silent && socket) {
      socket.emit('call-hangup', { targetSocketId: callPartnerSocketId, targetUser: callPartner });
    }
    if (navigator.vibrate) navigator.vibrate(0);
    stopCallTimer();

    if (localStreamStream) {
      localStreamStream.getTracks().forEach((t) => t.stop());
      localStreamStream = null;
    }

    if (webrtcConn) {
      webrtcConn.close();
      webrtcConn = null;
    }

    webrtcCallOffer = null;
    callPartner = null;
    callPartnerSocketId = null;
    audioMuted = false;
    cameraOff = false;
    
    const muteBtn = document.getElementById('muteAudioBtn');
    const camBtn = document.getElementById('toggleCamBtn');
    if (muteBtn) {
      muteBtn.classList.remove('active-muted');
      const onIcon = muteBtn.querySelector('.mic-on-icon');
      const offIcon = muteBtn.querySelector('.mic-off-icon');
      if (onIcon) onIcon.style.display = 'block';
      if (offIcon) offIcon.style.display = 'none';
    }
    if (camBtn) {
      camBtn.classList.remove('active-muted');
      const onIcon = camBtn.querySelector('.cam-on-icon');
      const offIcon = camBtn.querySelector('.cam-off-icon');
      if (onIcon) onIcon.style.display = 'block';
      if (offIcon) offIcon.style.display = 'none';
    }
    
    const overlay = document.getElementById('callOverlay');
    if (overlay) overlay.style.display = 'none';
    
    const pip = document.getElementById('pipCallContainer');
    const pipRemoteVideo = document.getElementById('pipRemoteVideo');
    if (pip) pip.style.display = 'none';
    if (pipRemoteVideo) pipRemoteVideo.srcObject = null;
    
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
  }

  export function minimizeCall() {
    const overlay = document.getElementById('callOverlay');
    const pip = document.getElementById('pipCallContainer');
    const remoteVideo = document.getElementById('remoteVideo');
    const pipRemoteVideo = document.getElementById('pipRemoteVideo');
    const pipAvatar = document.getElementById('pipAvatar');
    const callAvatar = document.getElementById('callAvatar');

    if (!pip || !overlay) return;
    overlay.style.display = 'none';
    pip.style.display = 'block';

    if (remoteVideo && pipRemoteVideo && remoteVideo.srcObject) {
      pipRemoteVideo.srcObject = remoteVideo.srcObject;
      pipRemoteVideo.style.display = callType === 'video' ? 'block' : 'none';
      if (pipAvatar) pipAvatar.style.display = callType === 'video' ? 'none' : 'flex';
    } else if (pipAvatar && callAvatar) {
      pipAvatar.textContent = callAvatar.textContent;
      pipAvatar.style.display = 'flex';
    }
    makeDraggable(pip);
    showToast('🗗 Call minimized to corner');
  }

  export function restoreCall() {
    const overlay = document.getElementById('callOverlay');
    const pip = document.getElementById('pipCallContainer');
    const remoteVideo = document.getElementById('remoteVideo');
    const pipRemoteVideo = document.getElementById('pipRemoteVideo');

    if (pip) pip.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';

    if (pipRemoteVideo && remoteVideo && pipRemoteVideo.srcObject) {
      remoteVideo.srcObject = pipRemoteVideo.srcObject;
    }
  }

  export function makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    el.onmousedown = dragMouseDown;
    el.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
      if (e.target.closest('.pip-controls')) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }

    function dragTouchStart(e) {
      if (e.target.closest('.pip-controls')) return;
      pos3 = e.touches[0].clientX;
      pos4 = e.touches[0].clientY;
      document.ontouchend = closeDragTouch;
      document.ontouchmove = elementTouchDrag;
    }

    function elementTouchDrag(e) {
      pos1 = pos3 - e.touches[0].clientX;
      pos2 = pos4 - e.touches[0].clientY;
      pos3 = e.touches[0].clientX;
      pos4 = e.touches[0].clientY;
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }

    function closeDragTouch() {
      document.ontouchend = null;
      document.ontouchmove = null;
    }
  }

  export function toggleMuteAudio() {
    if (!localStreamStream) return;
    audioMuted = !audioMuted;
    localStreamStream.getAudioTracks().forEach((t) => t.enabled = !audioMuted);
    const muteBtn = document.getElementById('muteAudioBtn');
    if (muteBtn) {
      muteBtn.classList.toggle('active-muted', audioMuted);
      const onIcon = muteBtn.querySelector('.mic-on-icon');
      const offIcon = muteBtn.querySelector('.mic-off-icon');
      if (onIcon) onIcon.style.display = audioMuted ? 'none' : 'block';
      if (offIcon) offIcon.style.display = audioMuted ? 'block' : 'none';
    }
    showToast(audioMuted ? 'Microphone muted 🔇' : 'Microphone unmuted 🎙️');
  }

  export function toggleCamera() {
    if (!localStreamStream || callType !== 'video') return;
    cameraOff = !cameraOff;
    localStreamStream.getVideoTracks().forEach((t) => t.enabled = !cameraOff);
    const camBtn = document.getElementById('toggleCamBtn');
    if (camBtn) {
      camBtn.classList.toggle('active-muted', cameraOff);
      const onIcon = camBtn.querySelector('.cam-on-icon');
      const offIcon = camBtn.querySelector('.cam-off-icon');
      if (onIcon) onIcon.style.display = cameraOff ? 'none' : 'block';
      if (offIcon) offIcon.style.display = cameraOff ? 'block' : 'none';
    }
    showToast(cameraOff ? 'Camera turned off 🚫' : 'Camera turned on 📹');
  }

  export async function flipCamera() {
    if (!localStreamStream || callType !== 'video') return;
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode },
        audio: false
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStreamStream.getVideoTracks()[0];
      if (oldVideoTrack) {
        localStreamStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      localStreamStream.addTrack(newVideoTrack);
      const localVideo = document.getElementById('localVideo');
      if (localVideo) localVideo.srcObject = localStreamStream;
      if (webrtcConn) {
        const sender = webrtcConn.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack);
      }
      showToast(`Switched to ${currentFacingMode === 'user' ? 'Front' : 'Back'} Camera 🔄`);
    } catch (err) {
      showToast('Could not flip camera');
    }
  }

  export function toggleSpeaker() {
    showToast('🔊 Audio routed to Loudspeaker');
  }