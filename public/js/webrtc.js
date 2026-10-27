// WebRTC 1:1 Voice & Video Call Client

export class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isAudioMuted = false;
    this.isVideoOff = false;
    this.callDurationInterval = null;
    this.callStartTime = 0;
    this.iceServers = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ];

    this.initElements();
    this.fetchConfig();
    this.bindSocketEvents();
  }

  initElements() {
    this.overlay = document.getElementById('call-overlay');
    this.partnerTitle = document.getElementById('call-partner-display');
    this.statusDisplay = document.getElementById('call-status-display');
    this.remoteVideo = document.getElementById('remote-video');
    this.localVideo = document.getElementById('local-video');
    this.muteBtn = document.getElementById('btn-call-mute');
    this.camBtn = document.getElementById('btn-call-cam');
    this.endBtn = document.getElementById('btn-call-end');

    if (this.muteBtn) {
      this.muteBtn.addEventListener('click', () => this.toggleMute());
    }
    if (this.camBtn) {
      this.camBtn.addEventListener('click', () => this.toggleCam());
    }
    if (this.endBtn) {
      this.endBtn.addEventListener('click', () => this.hangup('User ended call'));
    }
  }

  async fetchConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          this.iceServers = data.iceServers;
        }
      }
    } catch { /* use default STUN */ }
  }

  bindSocketEvents() {
    this.socket.on('call-offer', async ({ caller, type, sdp }) => {
      await this.handleIncomingCall(caller, type, sdp);
    });

    this.socket.on('call-answer', async ({ sdp }) => {
      await this.handleCallAnswer(sdp);
    });

    this.socket.on('call-candidate', async ({ candidate }) => {
      if (this.peerConnection && candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch { /* ignore stale candidate */ }
      }
    });

    this.socket.on('call-hangup', ({ reason }) => {
      this.cleanup(reason || 'Call ended');
    });

    this.socket.on('call-busy', () => {
      this.cleanup('Line is busy');
    });

    this.socket.on('call-unavailable', ({ message }) => {
      this.cleanup(message || 'Partner is unavailable');
    });

    this.socket.on('call-error', ({ message }) => {
      this.cleanup(message || 'Call error');
    });
  }

  createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('call-candidate', { candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        if (this.remoteVideo) this.remoteVideo.srcObject = this.remoteStream;
      }
      this.remoteStream.addTrack(event.track);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.startCallDurationTimer();
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.hangup('Connection lost');
      }
    };

    return pc;
  }

  async startCall(partnerName, isVideo = false) {
    this.showOverlay(`CALL // ${partnerName}`, 'DIALING...');

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
      });
      if (this.localVideo) this.localVideo.srcObject = this.localStream;

      this.peerConnection = this.createPeerConnection();
      this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.socket.emit('call-offer', {
        type: isVideo ? 'video' : 'voice',
        sdp: offer.sdp
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      this.cleanup(err.name === 'NotAllowedError' ? 'Microphone/camera permission denied' : 'Call init failed');
    }
  }

  async handleIncomingCall(caller, type, sdp) {
    this.showOverlay(`CALL // ${caller}`, 'INCOMING CALL...');

    const accept = confirm(`Incoming ${type} call from ${caller}. Accept?`);
    if (!accept) {
      this.socket.emit('call-hangup', { reason: 'Call declined' });
      this.cleanup('Call declined');
      return;
    }

    this.setStatus('CONNECTING...');

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
      });
      if (this.localVideo) this.localVideo.srcObject = this.localStream;

      this.peerConnection = this.createPeerConnection();
      this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.socket.emit('call-answer', { sdp: answer.sdp });
    } catch (err) {
      console.error('Failed to accept call:', err);
      this.hangup('Failed to connect media');
    }
  }

  async handleCallAnswer(sdp) {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
      this.setStatus('CONNECTED');
    } catch (err) {
      console.error('Set answer error:', err);
    }
  }

  showOverlay(title, status) {
    if (this.partnerTitle) this.partnerTitle.textContent = title;
    this.setStatus(status);
    if (this.overlay) this.overlay.classList.add('active');
  }

  setStatus(text) {
    if (this.statusDisplay) this.statusDisplay.textContent = text;
  }

  startCallDurationTimer() {
    this.callStartTime = Date.now();
    if (this.callDurationInterval) clearInterval(this.callDurationInterval);
    this.callDurationInterval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - this.callStartTime) / 1000);
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const ss = String(elapsedSec % 60).padStart(2, '0');
      this.setStatus(`CONNECTED ${mm}:${ss}`);
    }, 1000);
  }

  toggleMute() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.isAudioMuted = !this.isAudioMuted;
      audioTrack.enabled = !this.isAudioMuted;
      if (this.muteBtn) this.muteBtn.textContent = this.isAudioMuted ? '[UNMUTE]' : '[MUTE]';
    }
  }

  toggleCam() {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      this.isVideoOff = !this.isVideoOff;
      videoTrack.enabled = !this.isVideoOff;
      if (this.camBtn) this.camBtn.textContent = this.isVideoOff ? '[CAM ON]' : '[CAM OFF]';
    }
  }

  hangup(reason) {
    this.socket.emit('call-hangup', { reason });
    this.cleanup(reason);
  }

  cleanup(reason) {
    if (this.callDurationInterval) clearInterval(this.callDurationInterval);
    this.callDurationInterval = null;

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.remoteStream = null;
    if (this.localVideo) this.localVideo.srcObject = null;
    if (this.remoteVideo) this.remoteVideo.srcObject = null;

    if (reason && this.statusDisplay) {
      this.statusDisplay.textContent = reason.toUpperCase();
    }

    setTimeout(() => {
      if (this.overlay) this.overlay.classList.remove('active');
    }, 1200);
  }
}
