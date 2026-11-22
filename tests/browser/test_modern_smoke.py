"""Real-browser smoke checks for the statically served Modern application.

Run from the repository root after installing the Playwright Python package and
its Chromium browser: python -m unittest discover -s tests/browser -v

Every test receives an isolated browser context (including IndexedDB). A local
HTTP server is started inside the test process; no external host is required.
On failure, browser traces, screenshots and console diagnostics are saved under
browser-artifacts/ for the CI artifact uploader.
"""

from __future__ import annotations

import http.server
import json
import os
import re
from pathlib import Path
import threading
import unittest

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / 'browser-artifacts'


class QuietStaticHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):  # noqa: A002
        pass


class ModernBrowserSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), QuietStaticHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f'http://127.0.0.1:{cls.server.server_port}/CurvatureModern.html'
        cls.playwright = sync_playwright().start()
        launch = {'headless': True}
        if os.environ.get('CURVATURE_CHROMIUM_EXECUTABLE'):
            launch['executable_path'] = os.environ['CURVATURE_CHROMIUM_EXECUTABLE']
        cls.browser = cls.playwright.chromium.launch(**launch)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.browser.close()
            cls.playwright.stop()
        finally:
            cls.server.shutdown()
            cls.server.server_close()
            cls.server_thread.join(timeout=5)

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 900})
        self.context.tracing.start(screenshots=True, snapshots=True, sources=True)
        self.page = self.context.new_page()
        self.page.set_default_timeout(15000)
        self.console = []
        self.page.on('pageerror', lambda exc: self.console.append('PAGE ERROR: ' + str(exc)))
        self.page.on('console', lambda msg: self.console.append(f'console.{msg.type}: {msg.text}'))
        self.page.on('requestfailed', lambda req: self.console.append('REQUEST FAILED: ' + req.url))
        self.page.on('response', lambda response: self.console.append(
            f'HTTP {response.status}: {response.url}') if response.status >= 400 else None)

    def _failed(self):
        # unittest's _Outcome has no `success` property in Python 3.13.
        # Inspect the result's accumulated (test, traceback) pairs instead.
        result = getattr(getattr(self, '_outcome', None), 'result', None)
        if result is None:
            return False
        return any(test is self or getattr(test, 'test_case', None) is self
                   for test, _ in result.failures + result.errors)

    def _save_diagnostics(self):
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        name = self.id().rsplit('.', 1)[-1]
        (ARTIFACTS / f'{name}.log').write_text('\n'.join(self.console), encoding='utf-8')
        try:
            self.page.screenshot(path=str(ARTIFACTS / f'{name}.png'), full_page=True, timeout=5000)
        except Exception as exc:
            (ARTIFACTS / f'{name}-screenshot-error.txt').write_text(str(exc), encoding='utf-8')
        try:
            (ARTIFACTS / f'{name}.html').write_text(self.page.content(), encoding='utf-8')
        except Exception as exc:
            (ARTIFACTS / f'{name}-dom-error.txt').write_text(str(exc), encoding='utf-8')
        try:
            state = self.page.evaluate('''() => ({
                url: location.href,
                readyState: document.readyState,
                appLoaded: !!window.CurvatureModernApp,
                studioUiLoaded: !!window.CurvatureModernAnimationStudioUI,
                studioApiLoaded: !!window.CurvatureModernAnimationStudio,
                workspaceMode: window.CurvatureModernApp?.getWorkspaceMode?.() ?? null,
                workspacePreference: JSON.parse(localStorage.getItem(
                    window.CurvatureModernApplicationPreferences?.STORAGE_KEY) || 'null')?.workspace ?? null,
                historyState: history.state,
                workingUrlMatches: window.CurvatureModernExperimentState?.isWorkingExperimentUrl?.(location.href,localStorage) ?? false,
                workingUrlMarker: new URL(location.href).searchParams.get('working-session'),
                navigationType: performance.getEntriesByType('navigation')[0]?.type ?? null,
                persistenceStatus: document.querySelector('#ModernPersistenceStatus')?.textContent,
                tabs: [...document.querySelectorAll('.modern-tab')].map(t => ({
                    id:t.id, pressed:t.getAttribute('aria-pressed'), disabled:t.disabled})),
                animationTabPressed: document.querySelector('#ModernAnimationTab')?.getAttribute('aria-pressed'),
                animationWorkspaceHidden: document.querySelector('#ModernAnimationWorkspace')?.hidden ?? null,
                libraryHtml: document.querySelector('#ModernAnimationLibrary')?.innerHTML ?? null,
                scripts: [...document.scripts].map(s => s.src),
            })''')
            (ARTIFACTS / f'{name}-state.json').write_text(
                json.dumps(state, indent=2, ensure_ascii=False), encoding='utf-8')
        except Exception as exc:
            (ARTIFACTS / f'{name}-state-error.txt').write_text(str(exc), encoding='utf-8')

    def tearDown(self):
        failed = self._failed()
        try:
            if failed:
                self._save_diagnostics()
        finally:
            try:
                if failed:
                    ARTIFACTS.mkdir(parents=True, exist_ok=True)
                    name = self.id().rsplit('.', 1)[-1]
                    self.context.tracing.stop(path=str(ARTIFACTS / f'{name}-trace.zip'))
                else:
                    self.context.tracing.stop()
            finally:
                self.context.close()

    def open_modern(self):
        response = self.page.goto(self.base_url, wait_until='load', timeout=30000)
        self.assertEqual(response.status, 200)
        expect(self.page.locator('#ModernSceneTab')).to_be_visible()
        expect(self.page.locator('#ModernAnimationTab')).to_be_visible()

    def open_animation(self):
        self.page.locator('#ModernAnimationTab').click()
        expect(self.page.locator('#ModernAnimationWorkspace')).to_be_visible()
        # Library buttons set aria-label to their *description*, not their
        # visible caption. get_by_role(name='New project') cannot match one.
        # Match the visible text and wait for the asynchronous library render.
        expect(self.page.locator('#ModernAnimationLibrary').get_by_text('New project', exact=True)).to_be_visible(timeout=15000)

    def assert_shipped_demo_catalog(self):
        result = self.page.evaluate("""() => {
            const demos = window.CurvatureModernDemoCatalog.load();
            const soundly = demos.find(demo => demo.id === 'soundly');
            return {
                ids: demos.map(demo => demo.id),
                frames: soundly.project.keyframes.length,
                duration: window.CurvatureModernAnimationProject.totalMs(soundly.project),
                frozen: Object.isFrozen(demos) && Object.isFrozen(soundly.project.keyframes[0].value),
                display: soundly.project.baseExperiment.display.mode,
            };
        }""")
        self.assertEqual(result, {'ids': ['soundly'], 'frames': 9,
                                  'duration': 59100, 'frozen': True, 'display': 'compare'})

    def test_offline_presentation_compositor_pixels(self):
        # Deliberately no navigation or live app: the compositor is a standalone
        # consumer of exact-size physical pixels and decoded observation assets.
        self.page.set_content('<!doctype html><html><body></body></html>')
        for script in [
            'src/ui/modern/ModernExperimentState.js',
            'src/ui/modern/ModernExperimentFingerprint.js',
            'src/ui/modern/ModernCameraHud.js',
            'src/geometry/CurvatureSurfaceGeometry.js',
            'src/app/CurvaturePhysicalCamera.js',
            'src/camera/ModernCameraTelemetry.js',
            'src/camera/ModernCameraInterpolator.js',
            'src/animation/ModernAnimationCompatibility.js',
            'src/animation/ModernAnimationContract.js',
            'src/animation/ModernAnimationProject.js',
            'src/animation/ModernAnimationPresentation.js',
            'src/animation/ModernReferenceImage.js',
            'src/animation/ModernAnimationPresentationCompositor.js',
        ]:
            self.page.add_script_tag(content=(ROOT / script).read_text(encoding='utf-8'))
        project = json.loads((ROOT / 'demos/modern/soundly.json').read_text(encoding='utf-8'))['animations'][0]['project']
        result = self.page.evaluate("""async project => {
            const api = CurvatureModernAnimationPresentationCompositor;
            project.baseExperiment.display.mode = 'compare';
            project.contract.referenceExperiment.display.mode = 'compare';
            project.keyframes[0].referenceImageIds = ['photo'];
            project.keyframes[0].description = 'An observation';
            const raw = new OffscreenCanvas(300, 400), ctx = raw.getContext('2d');
            ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 300, 400);
            ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, 300, 100);
            const blob = await raw.convertToBlob(), image = await createImageBitmap(blob);
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader(); reader.onload = () => resolve(reader.result);
                reader.onerror = reject; reader.readAsDataURL(blob);
            });
            const photo = api.observation({version:1,id:'photo',title:'Synthetic test raster',
                original:{dataUrl,width:300,height:400}}, image);
            const results = [];
            for (const cameraHud of [false,true]) for (const referenceLayout of ['side', 'below', 'hidden', 'auto', 'stacked', 'wide']) {
                const plan = api.plan(project, {width:1280,referenceLayout,layoutMode:'fixed',referenceDimensions:[{id:'photo',width:300,height:400}],cameraHud,cameraHudAppearance:{size:125,position:'top-left',opacity:90}});
                for (const time of [0, plan.times[1].arrivalMs]) {
                    const f = api.frameAt(plan,time), views = {};
                    for (const side of f.sides) {
                        const canvas = new OffscreenCanvas(f.viewSize.width,f.viewSize.height), c=canvas.getContext('2d');
                        c.fillStyle = side==='A'?'#ff0000':'#0000ff'; c.fillRect(0,0,canvas.width,canvas.height);
                        views[side]={canvas,quality:'accurate',timeMs:time,cameraModel:{showModel:f.expected[side].showModel,Height:8,CameraEast:-45,CameraNorth:496,Pan:0.5,Nick:side==='A'?0:0.1,Roll:0,camViewAngle:0.1,deviceRatio:16/9,viewcenterHorizon:3,rEarth:6371000,rFEarth:10000000}};
                    }
                    const out=new OffscreenCanvas(f.width,f.height), painted=api.paint(out,f,views,f.referenceId?photo:null);
                    const pixel=(x,y)=>Array.from(out.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data);
                    for (const side of f.sides) {
                        const v=f.panels[side].viewport;
                        results.push({kind:side,pixel:pixel(v.x+v.width/2,v.y+v.height/2)});
                        if(cameraHud){
                            const data=out.getContext('2d').getImageData(v.x,v.y,v.width,v.height).data;
                            for(let j=0;j<data.length;j+=4){if(data[j]!== (side==='A'?255:0)||data[j+1]!==0||data[j+2]!== (side==='B'?255:0)||data[j+3]!==255)throw Error('Metadata covered a physical pixel');}
                        }
                    }
                    if(cameraHud){const h=f.cameraHud;results.push({kind:'hud',pixel:pixel(h.x+1,h.y+1)});}
                    if(f.referenceId){const r=api.contain(f.photoBox,300,400);
                        results.push({kind:'photo top',pixel:pixel(r.x+r.width/2,r.y+r.height/8)});
                        results.push({kind:'photo bottom',pixel:pixel(r.x+r.width/2,r.y+r.height*.75)});
                    }else if(f.photoBox){const r=f.photoBox;
                        results.push({kind:'blank',pixel:pixel(r.x+r.width/2,r.y+r.height/2)});
                    }
                    if(painted.warnings.length)throw Error(referenceLayout+' '+f.topology+' HUD='+cameraHud+' '+JSON.stringify(f.sceneCaption)+' '+painted.warnings.join(','));
                }
            }
            image.close(); return results;
        }""", project)
        colors = {'A': [255, 0, 0, 255], 'B': [0, 0, 255, 255],
                  'photo top': [255, 0, 255, 255], 'photo bottom': [0, 255, 0, 255],
                  'blank': [255, 255, 255, 255], 'hud': [232, 239, 245, 255]}
        self.assertEqual(len(result), 90)
        for item in result:
            self.assertEqual(item['pixel'], colors[item['kind']], item)

    def test_animation_worker_projection_pixels_after_resize(self):
        # Exercise the real Worker graph, optical painter and encoded pixels.
        # Use a simple vacuum scene to isolate projection from refraction.
        self.page.set_content('<!doctype html><html><body></body></html>')
        modules = {'ModernExperimentState.js', 'ModernExperimentFingerprint.js',
                   'ModernCameraHud.js', 'ModernCameraInterpolator.js', 'ModernCameraTelemetry.js',
                   'ModernCameraSequence.js', 'ModernSemanticNaming.js', 'ModernExperimentThumbnail.js',
                   'ModernAnimationCompatibility.js', 'ModernAnimationContract.js', 'ModernAnimationProject.js',
                   'ModernAnimationAtmosphereVariant.js', 'ModernReferenceImage.js', 'ModernReferenceImageLibrary.js',
                   'ModernAnimationSequences.js', 'ModernAnimationStudio.js', 'ModernAnimationLibrary.js',
                   'ModernDemoCatalogData.js', 'ModernDemoCatalog.js'}
        html = (ROOT / 'CurvatureModern.html').read_text(encoding='utf-8')
        for src in re.findall(r'<script src="([^"?]+)(?:\?[^"\n]*)?"', html):
            if Path(src).name in modules:
                self.page.add_script_tag(content=(ROOT / src).read_text(encoding='utf-8'))
                modules.remove(Path(src).name)
        self.assertEqual(modules, set())
        path = ROOT / 'src/animation/ModernAnimationFrameWorker.js'
        source = path.read_text(encoding='utf-8')
        block = re.search(r'importScripts\((.*?)\);', source, re.S)
        dependencies = [(path.parent / item.split('?')[0]).resolve().read_text(encoding='utf-8')
                        for item in re.findall(r"'([^']+)'", block.group(1))]
        result = self.page.evaluate(r"""async spec => {
            const project=CurvatureModernDemoCatalog.load().find(d=>d.id==='soundly').project;
            const urls=[];
            function blobUrl(text){const url=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));urls.push(url);return url;}
            const source=spec.source.replace(/importScripts\([\s\S]*?\);/,
                'importScripts('+spec.dependencies.map(blobUrl).map(JSON.stringify).join(',')+');');
            const probe=`self.onmessage=async ({data:project})=>{try{
                const session=setup({project,width:1280,height:720,fps:25,previewTimeMs:28200,
                    presentation:{referenceLayout:'hidden'}});
                const sample=JSON.parse(JSON.stringify(CurvatureModernAnimationProject.sampleAt(project,28200)));
                sample.display.horizon=true;sample.display.eyeLevel=true;
                sample.scene.camera.Roll=0;sample.scene.camera.Nick=0;
                sample.scene.camera.viewcenterHorizon=3;
                sample.scene.atmosphere='vacuum';
                sample.compare.A.surface='globe';sample.compare.A.atmosphere='vacuum';
                sample.compare.B.surface='globe';sample.compare.B.atmosphere='vacuum';
                // Reduce the object count only in this projection test.
                sample.scene.objects.NObjects=[1,0];sample.scene.showGrid=false;
                const rows=[];
                for(const mode of ['compare','scene']){
                    sample.display.mode=mode;
                    sample.scene.surface.showModel=1;
                    for(const [width,height] of [[416,234],[960,540],[640,360]]){
                        for(const side of mode==='compare'?['A','B']:['A']){
                            const frame=session.render(sample,side,{width,height});
                            const camera=frame.metrics.projectionCamera,model=frame.cameraModel;
                            const p=CurvatureRayHorizon.diagnose({geometry:'globe',radius:model.rEarth,
                                observerHeight:model.Height,atmosphere:'vacuum'});
                            if(p.status!=='resolved')throw Error('Expected resolved vacuum horizon');
                            const pan=model.Pan*Math.PI/180,angle=p.angleDegrees*Math.PI/180;
                            const forward=[Math.sin(pan)*Math.cos(angle),Math.cos(pan)*Math.cos(angle),Math.sin(angle)];
                            const nearPoint=forward.map(v=>v*1000),farPoint=forward.map(v=>v*2000);
                            const reference=CurvaturePerspectivePreview.project({primitives:[{type:'line',points:[nearPoint,farPoint]}]},camera,width,height);
                            const segment=reference.segments[0];
                            if(!segment)throw Error('Reference outside viewport');
                            const y=segment.points?segment.points[0][1]:segment.a[1];
                            const image=await createImageBitmap(await frame.canvas.convertToBlob());
                            const decoded=new OffscreenCanvas(width,height),ctx=decoded.getContext('2d');
                            ctx.drawImage(image,0,0);image.close();
                            const pixels=ctx.getImageData(0,0,width,height).data;
                            let best={count:0,y:-1};
                            for(let row=0;row<height;row++){
                                let count=0;
                                for(let x=40;x<width-10;x++){
                                    const i=(row*width+x)*4;
                                    if(pixels[i]>150&&pixels[i+1]>50&&pixels[i+1]<180&&pixels[i+2]<90)count++;
                                }
                                if(count>best.count)best={count,y:row};
                            }
                            rows.push({mode,side,width,height,y,painted:best.y,count:best.count,
                                center:camera.pixelTransform.offsetX,scale:camera.pixelTransform.scaleY});
                        }
                    }
                }
                self.postMessage({rows});
            }catch(e){self.postMessage({error:String(e.stack||e)});}};`;
            const worker=new Worker(blobUrl(source+probe));
            try{return await new Promise((resolve,reject)=>{
                worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.rows);
                worker.onerror=e=>reject(Error(e.message));worker.postMessage(project);
            });}finally{worker.terminate();urls.forEach(u=>URL.revokeObjectURL(u));}
        }""", {"source": source, "dependencies": dependencies})
        self.assertEqual(len(result), 9)
        for row in result:
            self.assertAlmostEqual(row['center'], row['width']/2, delta=1, msg=str(row))
            self.assertGreater(row['count'], row['width']*0.15, row)
            self.assertAlmostEqual(row['painted'], row['y'], delta=2, msg=str(row))

    def test_presentation_video_workers_with_original(self):
        # Real WebCodecs requires a secure origin (localhost qualifies).
        try:
            self.page.goto(self.base_url.replace('CurvatureModern.html', 'tests/'))
        except Exception as error:
            if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error):
                self.skipTest('Browser policy blocks localhost; WebCodecs needs a secure context')
            raise
        self._presentation_workers_with_original(live_video=True)

    def test_presentation_png_workers_with_original(self):
        self._presentation_workers_with_original(live_video=False)

    def test_canvas_direct_presentation_workers(self):
        self._presentation_workers_with_original(live_video=False, render_method="canvas-direct")

    def _presentation_workers_with_original(self, live_video, render_method="accurate"):
        # Production controller, Studio save/reopen and both real worker sources.
        # Blob URLs substitute only script transport, not the initialization or
        # rendering protocol; a separate full-page test covers the HTTP wiring.
        self.page.set_content('<!doctype html><html><body></body></html>')
        modules = {'ModernExperimentState.js', 'ModernExperimentFingerprint.js',
                   'ModernCameraHud.js', 'ModernCameraInterpolator.js', 'ModernCameraTelemetry.js',
                   'ModernCameraSequence.js', 'ModernSemanticNaming.js', 'ModernExperimentThumbnail.js',
                   'ModernAnimationCompatibility.js', 'ModernAnimationContract.js', 'ModernAnimationProject.js',
                   'ModernAnimationAtmosphereVariant.js', 'ModernReferenceImage.js', 'ModernReferenceImageLibrary.js',
                   'ModernAnimationSequences.js', 'ModernAnimationStudio.js', 'ModernAnimationLibrary.js',
                   'ModernDemoCatalogData.js', 'ModernDemoCatalog.js', 'ModernAnimationPresentation.js',
                   'ModernTargetIndicator.js', 'ModernAnimationCanvasHud.js', 'ModernAnimationPresentationCompositor.js',
                   'ModernAnimationFrameExport.js', 'ModernAnimationBackgroundExport.js',
                   'ModernAnimationVideoPipeline.js', 'ModernAnimationBackgroundVideoExport.js'}
        html = (ROOT / 'CurvatureModern.html').read_text(encoding='utf-8')
        for src in re.findall(r'<script src="([^"?]+)(?:\?[^"\n]*)?"', html):
            if Path(src).name in modules:
                self.page.add_script_tag(content=(ROOT / src).read_text(encoding='utf-8'))
                modules.remove(Path(src).name)
        self.assertEqual(modules, set())
        scripts = {}
        for name in ['ModernAnimationFrameWorker.js', 'ModernAnimationArchiveWorker.js', 'ModernAnimationVideoEncoderWorker.js']:
            path = ROOT / 'src/animation' / name
            source = path.read_text(encoding='utf-8')
            block = re.search(r'importScripts\((.*?)\);', source, re.S)
            dependencies = [(path.parent / item.split('?')[0]).resolve().read_text(encoding='utf-8')
                            for item in re.findall(r"'([^']+)'", block.group(1))]
            scripts[name] = {'source': source, 'dependencies': dependencies}
        result = self.page.evaluate(r"""async ({scripts,liveVideo,renderMethod}) => {
            const projects=CurvatureModernAnimationProject,studio=CurvatureModernAnimationStudio,
                library=CurvatureModernAnimationLibrary;
            const demo=CurvatureModernDemoCatalog.load().find(d=>d.id==='soundly');
            const copy=projects.validate({...demo.project,id:'soundly_copy',name:demo.project.name+' (copy)'});
            let draft=studio.fromProject(copy),key=draft.frames[4].key;
            draft=studio.editFrame(draft,key,'referenceImageIds',['photo']);
            draft=studio.editFrame(draft,key,'narrativeTitle','Real observation');
            draft=studio.editFrame(draft,key,'description','Observation');
            const saved=library.record(studio.buildSaved(draft,copy.id),'canvas-direct',copy.id,1,1);
            const reopened=library.normalize(JSON.parse(JSON.stringify(saved))).project;
            const playable=studio.build(studio.fromProject(reopened),copy.id);
            const raw=new OffscreenCanvas(3,4),c=raw.getContext('2d');
            c.fillStyle='#00ff00';c.fillRect(0,0,3,4);
            c.fillStyle='#ff00ff';c.fillRect(0,0,3,1);
            const blob=await raw.convertToBlob(),dataUrl=await new Promise(resolve=>{
                const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);
            });
            const original={version:1,id:'photo',title:'Synthetic portrait',author:'Observer',license:'CC BY',original:{dataUrl,width:3,height:4}};
            const urls=[],workers=[];
            function url(source){const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;}
            function WorkerCtor(path,probe=''){const name=path.split('?')[0].split('/').at(-1),spec=scripts[name],deps=spec.dependencies.map(url);
                const source=spec.source.replace(/importScripts\([\s\S]*?\);/,'importScripts('+deps.map(JSON.stringify).join(',')+');');
                const worker=new Worker(url(source+probe));workers.push(worker);return worker;
            }
            try{
                const controller=CurvatureModernAnimationBackgroundExport.create({WorkerCtor});
                const results=[];
                for(const project of [reopened,playable]){
                    const previewTimeMs=projects.timeline(project)[4].arrivalMs;
                    let limit;
                    try{await controller.start({project,width:1280,height:720,fps:25,workerCount:1,renderMethod,
                        presentation:{referenceLayout:'side'},referenceImages:[original]});}catch(e){limit=e.message;}
                    if(!limit?.includes('1479 requested; maximum 751'))throw Error('Unexpected sequence limit: '+limit);
                    const done=await controller.start({project,width:1280,height:720,fps:25,workerCount:1,renderMethod,
                        presentation:{referenceLayout:'auto',layoutMode:'fixed'},referenceImages:[original],previewTimeMs,cameraHud:true});
                    if(done.manifest.presentation.cameraHudPlacement!=='external'||done.manifest.frames[0].warnings.some(w=>w.startsWith('camera')))throw Error('Presentation HUD: '+JSON.stringify(done.manifest.frames[0].warnings));
                    const image=await createImageBitmap(done.previewBlob),canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');
                    ctx.drawImage(image,0,0);
                    const pixels=ctx.getImageData(0,0,image.width,image.height).data;
                    let green=0,magenta=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]===0&&pixels[i+1]===255&&pixels[i+2]===0)green++;if(pixels[i]===255&&pixels[i+1]===0&&pixels[i+2]===255)magenta++;}
                    results.push({width:image.width,height:image.height,green,magenta,version:done.manifest.project.version,
                        time:done.manifest.frames[0].timeMs,sides:done.manifest.sides,reference:done.manifest.frames[0].referenceId,
                        author:done.manifest.presentation.referenceImages[0].author,title:done.manifest.project.keyframes[4].narrativeTitle,
                        optical:Object.keys(done.manifest.frames[0].renderStats),zip:done.blob.type});image.close();
                }
                // Short sequence from the actual edited project, with a real
                // photograph at arrival. Use the disk-writer protocol against an
                // instrumented sink (no native file-picker permissions in CI).
                const frames=playable.keyframes.slice(4,6).map((f,i)=>({...f,travelMs:i?400:0,holdMs:0,
                    referenceImageIds:[i?'landscape':'photo']}));
                const wide=new OffscreenCanvas(4,3),wc=wide.getContext('2d');wc.fillStyle='#00ffff';wc.fillRect(0,0,4,3);
                const wideBlob=await wide.convertToBlob(),wideUrl=await new Promise(resolve=>{
                    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(wideBlob);
                });
                const landscape={version:1,id:'landscape',title:'Landscape.jpg',original:{dataUrl:wideUrl,width:4,height:3}};
                const short=projects.validate({...playable,keyframes:frames});
                const chunks=[],sink={closed:false,aborted:false,async write(part){chunks.push(part.slice());},
                    async close(){this.closed=true;},async abort(){this.aborted=true;}};
                const settings={project:short,width:1280,height:720,fps:5,workerCount:2,renderMethod,
                    presentation:{referenceLayout:'auto',layoutMode:'fixed'},referenceImages:[original,landscape],cameraHud:true};
                const stream=await controller.start({...settings,sink});
                const preview=await controller.start({...settings,previewTimeMs:200});
                const previewData=await new Promise(resolve=>{
                    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(preview.previewBlob);
                });
                const zip=new Blob(chunks,{type:'application/zip'}),data=await new Promise(resolve=>{
                    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(zip);
                });
                const videoSettings={...settings,fps:10,format:'webm'};
                // Exercise the actual video renderer and compositor even where WebCodecs
                // is unavailable: capture the Canvas passed to the VideoFrame constructor.
                const probe=`self.onmessage=async ({data})=>{try{
                    const p=setup(data,true),frames=[];
                    for(const index of [0,2,3]){const frame=await CurvatureModernAnimationVideoPipeline.renderTimestamp(p.plan,index,p.render,class {constructor(canvas){this.canvas=canvas;}close(){}},null,p.compose,p.presentationAdapter);
                        frames.push({blob:await frame.frames.PRESENTATION.canvas.convertToBlob(),time:frame.sampleTimeMs});}
                    self.postMessage({frames});
                }catch(e){self.postMessage({error:String(e.stack||e)});}};`;
                const renderer=WorkerCtor('ModernAnimationFrameWorker.js',probe);
                const captured=await new Promise((resolve,reject)=>{renderer.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data);renderer.onerror=e=>reject(Error(e.message));renderer.postMessage(videoSettings);});
                const capturedData=await Promise.all(captured.frames.map(async frame=>({time:frame.time,data:await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(frame.blob);})})));
                if(capturedData[1].time!==200||capturedData[1].data!==previewData)throw Error('Video Canvas and PNG preview differ');
                let encodedVideo=null;
                if(liveVideo){
                const video=await CurvatureModernAnimationBackgroundVideoExport.create({WorkerCtor}).start(videoSettings);
                function colors(source,width,height){
                    const decoded=new OffscreenCanvas(width,height),dc=decoded.getContext('2d');
                    dc.drawImage(source,0,0);
                    const px=dc.getImageData(0,0,width,height).data;
                    let green=0,cyan=0;for(let i=0;i<px.length;i+=4){
                        if(px[i]<50&&px[i+1]>180&&px[i+2]<50)green++;
                        if(px[i]<50&&px[i+1]>180&&px[i+2]>180)cyan++;
                    }return {green,cyan};
                }
                const sourceColors=[];
                for(const i of [0,2]){
                    const image=await createImageBitmap(captured.frames[i].blob);
                    try{sourceColors.push(colors(image,image.width,image.height));}finally{image.close();}
                }
                const clip=document.createElement('video'),clipUrl=URL.createObjectURL(video.blob);urls.push(clipUrl);
                clip.muted=true;clip.preload='auto';clip.playsInline=true;
                document.body.appendChild(clip);
                // loadeddata is not a presentation fence. Explicitly seek to
                // the middle of each intended coded interval and wait for
                // seek completion and current-frame availability.
                function event(name,action){
                    return new Promise((resolve,reject)=>{
                        let timeout;
                        function cleanup(){clearTimeout(timeout);clip.removeEventListener(name,done);clip.removeEventListener('error',failed);}
                        function done(){cleanup();resolve();}
                        function failed(){cleanup();reject(Error('Video '+name+' failed: '+(clip.error?.message||'decode error')));}
                        clip.addEventListener(name,done);clip.addEventListener('error',failed);
                        timeout=setTimeout(()=>{cleanup();reject(Error('Timed out waiting for video '+name));},10000);
                        action();
                    });
                }
                try{
                    await event('loadeddata',()=>{clip.src=clipUrl;});
                    async function sample(time){
                        await event('seeked',()=>{clip.currentTime=time;});
                        if(clip.seeking||clip.readyState<HTMLMediaElement.HAVE_CURRENT_DATA||Math.abs(clip.currentTime-time)>.001)
                            throw Error('Decoded frame is not ready at '+time+' s');
                        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                        return colors(clip,clip.videoWidth,clip.videoHeight);
                    }
                    const first=await sample(.05),last=await sample(.35);
                    encodedVideo={filename:video.filename,manifest:video.manifest,type:video.blob.type,width:clip.videoWidth,height:clip.videoHeight,first,last,sourceColors};
                }finally{clip.removeAttribute('src');clip.load();clip.remove();}
                }
                return {video:encodedVideo,canvasParity:capturedData,previews:results,stream:{closed:sink.closed,aborted:sink.aborted,bytes:stream.bytesWritten,
                    streamed:stream.streamed,hasBlob:!!stream.blob,manifest:stream.manifest,zip:data,
                    preview:previewData,previewRow:preview.manifest.frames[0]}};
            }finally{workers.forEach(w=>w.terminate());urls.forEach(u=>URL.revokeObjectURL(u));}
        }""", {"scripts": scripts, "liveVideo": live_video, "renderMethod": render_method})
        self.assertEqual([f['time'] for f in result['canvasParity']], [0, 200, 400])
        if live_video:
            video = result['video']
            self.assertEqual(video['type'], 'video/webm')
            self.assertTrue(video['filename'].endswith('_presentation.webm'))
            self.assertEqual((video['width'], video['height']), (1280, 720))
            self.assertEqual(video['manifest']['frameCount'], 4)
            self.assertEqual(video['manifest']['durationUs'], 400000)
            self.assertEqual(video['manifest']['outputStreams'], 1)
            self.assertEqual(video['manifest']['presentation']['cameraHudPlacement'], 'external')
            self.assertGreater(video['sourceColors'][0]['green'], 100, video['sourceColors'])
            self.assertGreater(video['sourceColors'][1]['cyan'], 100, video['sourceColors'])
            self.assertGreater(video['first']['green'], 100, video)
            self.assertGreater(video['last']['cyan'], 100, video)
        self.assertEqual([item['version'] for item in result['previews']], [2, 1])
        for item in result['previews']:
            self.assertEqual((item['width'], item['height']), (1280, 720))
            self.assertGreater(item['green'], 100)
            self.assertGreater(item['magenta'], 100)
            self.assertEqual(item['time'], 28200)
            self.assertEqual(item['sides'], ['presentation'])
            self.assertEqual(item['reference'], 'photo')
            self.assertEqual(item['author'], 'Observer')
            self.assertEqual(item['title'], 'Real observation')
            self.assertEqual(item['optical'], ['A', 'B'])
            self.assertEqual(item['zip'], 'application/zip')

        import base64
        import io
        import zipfile
        stream = result['stream']
        self.assertTrue(stream['closed'] and stream['streamed'])
        self.assertFalse(stream['aborted'] or stream['hasBlob'])
        payload = base64.b64decode(stream['zip'].split(',', 1)[1])
        self.assertEqual(stream['bytes'], len(payload))
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.namelist(), ['frames/frame_00000_presentation.png',
                                                'frames/frame_00001_presentation.png',
                                                'frames/frame_00002_presentation.png', 'manifest.json'])
            for index, frame in enumerate(result['canvasParity']):
                self.assertEqual(base64.b64decode(frame['data'].split(',', 1)[1]), archive.read(f'frames/frame_{index:05d}_presentation.png'))
            manifest = json.loads(archive.read('manifest.json'))
            self.assertEqual(manifest, stream['manifest'])
            self.assertEqual(manifest['quality'], render_method)
            self.assertEqual(manifest['presentation']['cameraHudPlacement'], 'external')
            self.assertEqual([f['timeMs'] for f in manifest['frames']], [0, 200, 400])
            self.assertEqual([f['referenceId'] for f in manifest['frames']], ['photo', None, 'landscape'])
            self.assertEqual(len({f['topology'] for f in manifest['frames']}), 1)
            self.assertTrue(all(f['viewSize'] == manifest['frames'][0]['viewSize'] for f in manifest['frames']))
            for field in ['topology', 'viewSize', 'referenceId', 'timeMs']:
                self.assertEqual(stream['previewRow'][field], manifest['frames'][1][field])
            self.assertEqual(base64.b64decode(stream['preview'].split(',', 1)[1]),
                             archive.read('frames/frame_00001_presentation.png'))
            for name in archive.namelist()[:3]:
                self.assertEqual(archive.read(name)[:8], b'\x89PNG\r\n\x1a\n')

    def open_physical_calibration(self):
        self.open_modern()
        self.page.wait_for_function("window.CurvatureModernApp?.getWorkspaceMode() === 'scene'")
        self.page.evaluate("() => {const m=CurvatureModernApp.getModel();m.showModel=1;m.Update();}")
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        workspace=self.page.locator('#ModernPhotoCalibration')
        expect(workspace).to_be_visible()
        return workspace

    def soundly_calibration_experiment(self, observations=None, reference=None):
        fixture=json.loads((ROOT/'tests/fixtures/soundly-mixed-calibration.json').read_text(encoding='utf-8'))
        if observations is not None:
            fixture['observations']=observations
        return self.page.evaluate("""async ({fixture,reference}) => {
            const {model,observations,options}=fixture;
            const scene={model:{...CurvatureModernApp.getPhotoCalibrationScene().model,...model,DemoText:'Soundly regression'},
              physics:{atmosphere:options.atmosphere,temperatureProfile:options.temperatureProfile}};
            if(!reference){
              const c=document.createElement('canvas');c.width=options.width;c.height=options.height;
              const ctx=c.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,c.width,c.height);
              const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
              reference=await CurvatureModernReferenceImageImport.ingest(
                new File([blob],'Soundly regression raster.png',{type:'image/png'}),'calibration-regression',window);
            }
            return {format:'curvature-photo-calibration',version:3,scene,referenceImage:reference,referenceSource:null,
              observations,fit:{method:'canvas-direct',maxIterations:80,freeParameters:options.freeParameters,
                result:null,status:'Regression fixture',running:false}};
        }""",{'fixture':fixture,'reference':reference})

    def import_calibration_experiment(self, data, replace=False):
        if replace:
            self.page.once('dialog',lambda prompt:prompt.accept())
        self.assertTrue(self.page.evaluate(
            "d=>CurvatureModernPhotoCalibrationEditor.mount(document).importExperiment(d)",data))


    def test_calibration_projects_library_adopts_retained_draft_and_reopens_it(self):
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        button=workspace.locator('#ModernCalibrationProjectsToggle')
        button.click()
        expect(panel).to_be_visible()
        expect(button).to_have_attribute('aria-expanded','true')
        expect(workspace.locator('#ModernCalibrationProjectsLegacy')).to_be_visible(timeout=30000)
        expect(workspace.locator('#ModernCalibrationProjectsList')).to_contain_text(
            'No saved Calibration Projects')
        workspace.locator('#ModernCalibrationProjectsAdopt').click()
        rows=workspace.locator('[data-calibration-project-id]')
        expect(rows).to_have_count(1,timeout=30000)
        expect(workspace.locator('#ModernCalibrationProjectsStatus')).to_contain_text(
            'Existing draft adopted',timeout=30000)
        # Adoption creates an independent saved project, without opening it.
        # Its explicit success message must survive the final list rerender.
        self.assertIsNone(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus()?.projectId ?? null"""))
        row=rows.first
        self.assertIn('correspondences',row.inner_text().lower())
        self.assertIn('No reference photo',row.inner_text())
        self.assertEqual(self.page.evaluate("""async () => {
            const rows=await CurvatureModernCalibrationProjectStore.list(indexedDB);
            const item=await CurvatureModernCalibrationProjectStore.get(indexedDB,rows[0].id);
            return {count:rows.length,photo:item.photo,embedded:JSON.stringify(item).includes('data:image'),
                raw:!!(await CurvatureModernCalibrationProjectStore.legacy(indexedDB))};
        }"""),{'count':1,'photo':None,'embedded':False,'raw':True})
        saved_id=row.get_attribute('data-calibration-project-id')
        # Open re-renders its card before the click bubbles to the workspace.
        # The event path must still exclude this UI action from editor autosave.
        row.locator('[data-calibration-project-open]').click()
        expect(panel).to_be_hidden(timeout=30000)
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId"""),
            saved_id)
        expect(button).to_have_attribute('aria-expanded','false')
        expect(workspace.locator('#ModernCalibrationStorage')).to_contain_text(
            'Calibration Project',timeout=30000)
        button.click()
        expect(panel).to_be_visible()
        selected=workspace.locator('[data-project-active="true"]')
        expect(selected).to_have_count(1)
        expect(selected).to_contain_text('Opened')
        expect(selected.locator('[data-calibration-project-delete]')).to_be_enabled()
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        expect(panel).to_be_hidden()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_calibration_projects_crud_and_import_as_new(self):
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        expect(panel).to_be_visible()
        self.page.once('dialog',lambda dialog:dialog.accept('Independent scene'))
        workspace.locator('#ModernCalibrationProjectsNew').click()
        expect(panel).to_be_hidden(timeout=30000)
        active=self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId""")
        self.assertIsNotNone(active)
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        active_row=panel.locator('[data-calibration-project-id="'+active+'"]')
        expect(active_row).to_contain_text('Independent scene',timeout=30000)
        expect(active_row).to_have_class(re.compile(r'is-selected'))
        expect(active_row.locator('[data-calibration-project-delete]')).to_be_enabled()
        self.page.once('dialog',lambda dialog:dialog.accept('Renamed independent'))
        active_row.locator('[data-calibration-project-rename]').click()
        expect(active_row).to_contain_text('Renamed independent',timeout=30000)
        active_row.locator('[data-calibration-project-duplicate]').click()
        copy_row=panel.locator('[data-calibration-project-id]').filter(
            has_text='Renamed independent (copy)')
        expect(copy_row).to_have_count(1,timeout=30000)
        result=self.page.evaluate("""async () => {
            const rows=await CurvatureModernCalibrationProjectStore.list(indexedDB);
            const original=rows.find(r=>r.title==='Renamed independent');
            const duplicate=rows.find(r=>r.title==='Renamed independent (copy)');
            const a=await CurvatureModernCalibrationProjectStore.get(indexedDB,original.id);
            const b=await CurvatureModernCalibrationProjectStore.get(indexedDB,duplicate.id);
            return {active:CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId,
                distinct:a.id!==b.id&&a.checkpoint.payload.draft.physicalSessionId!==b.checkpoint.payload.draft.physicalSessionId,
                noPhoto:a.photo===null&&b.photo===null};
        }""")
        self.assertEqual(result,{'active':active,'distinct':True,'noPhoto':True})
        self.page.once('dialog',lambda dialog:dialog.accept())
        copy_row.locator('[data-calibration-project-delete]').click()
        expect(copy_row).to_have_count(0,timeout=30000)
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId"""),active)
        experiment=self.soundly_calibration_experiment()
        import json
        panel.locator('#ModernCalibrationProjectsImportFile').set_input_files({
            'name':'import-calibration.json','mimeType':'application/json',
            'buffer':json.dumps(experiment).encode('utf-8')})
        imported=panel.locator('[data-calibration-project-id]').filter(
            has_text='Soundly regression raster')
        expect(imported).to_have_count(1,timeout=30000)
        expect(imported).to_have_class(re.compile(r'is-selected'))
        expect(imported).to_have_attribute('data-project-active','false')
        imported_id=imported.get_attribute('data-calibration-project-id')
        self.assertEqual(self.page.evaluate("""async id => {
            const row=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
            return {hasVerifiedPhoto:!!row.photo?.identity?.sha256,
                noEmbeddedPhoto:!JSON.stringify(row).includes('data:image'),
                photoOnlyByReference:row.checkpoint.payload.draft.record===null};
        }""",imported_id),
            {'hasVerifiedPhoto':True,'noEmbeddedPhoto':True,'photoOnlyByReference':True})
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId"""),active)
        imported.locator('[data-calibration-project-open]').click()
        expect(panel).to_be_hidden(timeout=30000)
        expect(workspace.locator('#ModernCalibrationPhotoInfo')).to_contain_text(
            'Soundly',timeout=30000)
        with self.page.expect_download() as exported:
            workspace.locator('#ModernCalibrationExportExperiment').click()
        self.assertEqual(exported.value.suggested_filename,
                         'calibration-Soundly regression raster.png.json')
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        opened=panel.locator('[data-calibration-project-id="'+imported_id+'"]')
        expect(opened).to_have_class(re.compile(r'is-selected'))
        expect(opened).to_have_attribute('data-project-active','true')
        expect(opened.locator('[data-calibration-project-open]')).to_have_count(0)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_calibration_new_project_can_be_deleted_while_open(self):
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        self.page.once('dialog',lambda dialog:dialog.accept('Disposable calibration'))
        panel.locator('#ModernCalibrationProjectsNew').click()
        expect(panel).to_be_hidden(timeout=30000)
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        active=panel.locator('[data-project-active="true"]')
        expect(active).to_contain_text('Disposable calibration',timeout=30000)
        expect(active.locator('[data-calibration-project-delete]')).to_be_enabled()
        project_id=active.get_attribute('data-calibration-project-id')
        remaining=self.page.evaluate("""async id =>
            (await CurvatureModernCalibrationProjectStore.list(indexedDB))
            .filter(row => row.id !== id).map(row => row.id)""",project_id)
        self.page.once('dialog',lambda dialog:dialog.accept())
        with self.page.expect_navigation(wait_until='domcontentloaded'):
            active.locator('[data-calibration-project-delete]').click()
        # Reload retains the Calibration workspace preference; there is no
        # reason to return to Scene or reopen an already visible editor.
        workspace=self.page.locator('#ModernPhotoCalibration')
        expect(workspace).to_be_visible(timeout=30000)
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        if not panel.is_visible():
            workspace.locator('#ModernCalibrationProjectsToggle').click()
        expect(panel).to_be_visible(timeout=30000)
        expect(panel.locator('[data-calibration-project-id="'+project_id+'"]')).to_have_count(0,timeout=30000)
        if remaining:
            expect(panel.locator('[data-project-active="true"]')).to_have_count(1,timeout=30000)
            expect(panel.locator('[data-project-active="true"]')).to_have_attribute(
                'data-calibration-project-id',remaining[0])
            expect(panel.locator('[data-project-active="true"]')).to_have_class(
                re.compile(r'is-selected'))
            expect(panel.locator('[data-project-active="true"]')).to_contain_text('Opened')
        else:
            expect(panel.locator('[data-project-active="true"]')).to_have_count(0)
            expect(workspace.locator('#ModernCalibrationPhotoInfo')).to_be_empty()
        self.assertEqual(self.page.evaluate("""async id =>
            (await CurvatureModernCalibrationProjectStore.get(indexedDB,id)) === null""",
            project_id),True)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_calibration_delete_new_project_reopens_previous_photo_project(self):
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        import json
        experiment=self.soundly_calibration_experiment()
        panel.locator('#ModernCalibrationProjectsImportFile').set_input_files({
            'name':'prior-photo.json','mimeType':'application/json',
            'buffer':json.dumps(experiment).encode('utf-8')})
        prior=panel.locator('[data-calibration-project-id]').filter(
            has_text='Soundly regression raster')
        expect(prior).to_have_count(1,timeout=30000)
        prior_id=prior.get_attribute('data-calibration-project-id')
        prior.locator('[data-calibration-project-open]').click()
        expect(panel).to_be_hidden(timeout=30000)
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        self.page.once('dialog',lambda dialog:dialog.accept('Temporary new project'))
        panel.locator('#ModernCalibrationProjectsNew').click()
        expect(panel).to_be_hidden(timeout=30000)
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        temporary=panel.locator('[data-project-active="true"]')
        expect(temporary).to_contain_text('Temporary new project',timeout=30000)
        self.page.once('dialog',lambda dialog:dialog.accept())
        with self.page.expect_navigation(wait_until='domcontentloaded'):
            temporary.locator('[data-calibration-project-delete]').click()
        workspace=self.page.locator('#ModernPhotoCalibration')
        expect(workspace).to_be_visible(timeout=30000)
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        if not panel.is_visible():
            workspace.locator('#ModernCalibrationProjectsToggle').click()
        expect(panel).to_be_visible(timeout=30000)
        expect(panel.locator('[data-calibration-project-id="'+prior_id+'"]')).to_have_count(1,timeout=30000)
        active=panel.locator('[data-project-active="true"]')
        expect(active).to_have_count(1,timeout=30000)
        expect(active).to_have_attribute('data-calibration-project-id',prior_id)
        expect(active).to_have_class(re.compile(r'is-selected'))
        expect(active.locator('[data-calibration-project-open]')).to_have_count(0)
        expect(workspace.locator('#ModernCalibrationPhotoInfo')).to_contain_text(
            'Soundly regression raster',timeout=30000)
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId"""),
            prior_id)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_calibration_project_library_selection_is_separate_from_guarded_open(self):
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        self.page.once('dialog',lambda dialog:dialog.accept('First calibration'))
        panel.locator('#ModernCalibrationProjectsNew').click()
        expect(panel).to_be_hidden(timeout=30000)
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        self.page.once('dialog',lambda dialog:dialog.accept('Second calibration'))
        panel.locator('#ModernCalibrationProjectsNew').click()
        expect(panel).to_be_hidden(timeout=30000)
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        cards=panel.locator('[data-calibration-project-id]')
        # Opening the first named project adopts the pre-existing legacy draft.
        # Assert a protected recovery project, not simply an arbitrary third card.
        expect(cards).to_have_count(3,timeout=30000)
        rows=self.page.evaluate("""async () => {
            const summaries=await CurvatureModernCalibrationProjectStore.list(indexedDB);
            const legacy=await CurvatureModernCalibrationProjectStore.legacy(indexedDB);
            return {titles:summaries.map(row=>row.title),
                ids:summaries.map(row=>row.id),rawPreserved:!!legacy};
        }""")
        self.assertCountEqual(rows['titles'],
                              ['Recovered calibration','First calibration','Second calibration'])
        self.assertEqual(len(set(rows['ids'])),3)
        self.assertTrue(rows['rawPreserved'],'legacy draft recovery copy must remain available')
        named=cards.filter(has_text=re.compile(r'First calibration|Second calibration'))
        expect(named).to_have_count(2)
        self.assertTrue(named.first.evaluate('(node) => node.clientWidth <= 290'))
        initial=self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId""")
        self.assertEqual(initial,
                         panel.locator('[data-calibration-project-id]').filter(
                             has_text='Second calibration').get_attribute('data-calibration-project-id'))
        first=panel.locator('[data-calibration-project-id]').filter(has_text='First calibration')
        first.click()
        expect(first).to_have_class(re.compile(r'is-selected'))
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId"""),initial)
        expect(panel).to_be_visible()
        expect(first.locator('.modern-animation-library-card-status')).to_be_visible()
        first.dblclick()
        expect(panel).to_be_hidden(timeout=30000)
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId"""),
            first.get_attribute('data-calibration-project-id'))
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        opened=panel.locator('[data-calibration-project-id="'+first.get_attribute('data-calibration-project-id')+'"]')
        expect(opened).to_contain_text('Opened')
        expect(opened).to_have_attribute('data-project-active','true')
        expect(opened).to_have_class(re.compile(r'is-editing'))
        expect(opened.locator('[data-calibration-project-open]')).to_have_count(0)
        expect(opened.locator('.modern-animation-library-status-editing')).to_be_visible()
        other=panel.locator('[data-calibration-project-id]').filter(has_text='Second calibration')
        expect(other.locator('[data-calibration-project-open]')).to_be_visible()
        # Selection is independent of the opened editor, as in Animation Studio.
        other.click()
        expect(other).to_have_class(re.compile(r'is-selected'))
        expect(opened.locator('.modern-animation-library-status-editing')).to_be_visible()
        expect(opened.locator('[data-calibration-project-open]')).to_have_count(0)
        expect(opened.locator('[data-calibration-project-delete]')).to_be_enabled()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_calibration_project_photo_selection_retains_verified_library_original(self):
        import base64
        workspace=self.open_physical_calibration()
        data=self.soundly_calibration_experiment()
        original=data['referenceImage']['original']['dataUrl']
        workspace.locator('#ModernCalibrationFile').set_input_files({
            'name':'selected-original.png','mimeType':'image/png',
            'buffer':base64.b64decode(original.split(',',1)[1])})
        expect(workspace.locator('#ModernCalibrationPhotoInfo')).to_contain_text(
            'selected-original.png',timeout=30000)
        result=self.page.evaluate("""async () => {
            const editor=CurvatureModernPhotoCalibrationEditor.mount(document);
            const active=editor.exportExperiment(),saved=await CurvatureModernReferenceImageLibrary.list(indexedDB);
            const identity=await CurvatureModernReferenceImageImport.identify(active.referenceImage,window);
            const rows=await Promise.all(saved.map(x=>CurvatureModernReferenceImageLibrary.get(indexedDB,x.id)));
            return {count:rows.length,matched:rows.some(x=>x&&x.record.original.dataUrl===active.referenceImage.original.dataUrl),
                shaLength:identity.sha256.length,source:active.referenceSource.source};
        }""")
        self.assertEqual(result,{'count':1,'matched':True,'shaLength':64,'source':'local'})
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)


    def test_calibration_projects_two_tabs_conflict_fork_and_stale_delete(self):
        # Two real Chromium tabs share one origin/IndexedDB, but each has a
        # separately bound editor generation and an independent CAS revision.
        # The stale save is deliberately ordered after the first durable ack:
        # correctness must not depend on which transaction wins a timing race.
        workspace=self.open_physical_calibration()
        toggle=workspace.locator('#ModernCalibrationProjectsToggle')
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        toggle.click()
        self.page.once('dialog',lambda dialog:dialog.accept('Shared calibration'))
        panel.locator('#ModernCalibrationProjectsNew').click()
        expect(panel).to_be_hidden(timeout=30000)
        parent=self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus().projectId""")
        self.assertIsNotNone(parent)
        initial=self.page.evaluate("""async id =>
            (await CurvatureModernCalibrationProjectStore.get(indexedDB,id)).revision""",parent)

        other=self.context.new_page()
        other_errors=[]
        other.on('pageerror',lambda exc:other_errors.append(str(exc)))
        try:
            response=other.goto(self.base_url,wait_until='load',timeout=30000)
            self.assertEqual(response.status,200)
            other_workspace=other.locator('#ModernPhotoCalibration')
            if not other_workspace.is_visible():
                expect(other.locator('#ModernPhotoCalibrationOpen')).to_be_enabled(timeout=30000)
                other.locator('#ModernPhotoCalibrationOpen').click()
            expect(other_workspace).to_be_visible(timeout=30000)
            other_workspace.locator('#ModernCalibrationProjectsToggle').click()
            other_panel=other_workspace.locator('#ModernCalibrationProjectsPanel')
            target=other_panel.locator('[data-calibration-project-id="'+parent+'"]')
            expect(target).to_be_visible(timeout=30000)
            target.locator('[data-calibration-project-open]').click()
            expect(other_panel).to_be_hidden(timeout=30000)

            status="""() =>
                CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus()"""
            self.assertEqual(other.evaluate(status)['projectId'],parent)
            self.assertEqual(other.evaluate(status)['revision'],initial)
            self.assertEqual(self.page.evaluate(status)['projectId'],parent)

            # Tab A writes a complete calibration-stage checkpoint.
            workspace.locator('[data-calibration-stage="calibration"]').click()
            self.page.wait_for_function("""({id,revision}) => {
                const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                return s?.projectId===id && s.revision>revision && s.pending===0 && !s.unsaved;
            }""",arg={'id':parent,'revision':initial},timeout=30000)
            committed=self.page.evaluate("""async id => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return {revision:p.revision,stage:p.checkpoint.payload.draft.stage};
            }""",parent)
            self.assertGreater(committed['revision'],initial)
            self.assertEqual(committed['stage'],'calibration')
            self.assertEqual(other.evaluate(status)['revision'],initial,
                             'the other tab must still own its stale expected revision')

            # Tab B saves a different complete state against that stale
            # revision. It must be rebound to a new fork, not overwrite A.
            other_workspace.locator('[data-calibration-stage="result"]').click()
            other.wait_for_function("""id => {
                const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                return s?.projectId && s.projectId!==id && s.pending===0 && !s.unsaved;
            }""",arg=parent,timeout=30000)
            fork=other.evaluate(status)['projectId']
            self.assertNotEqual(fork,parent)
            self.assertEqual(self.page.evaluate(status)['projectId'],parent)
            saved=self.page.evaluate("""async ({parent,fork}) => {
                const store=CurvatureModernCalibrationProjectStore;
                const a=await store.get(indexedDB,parent),b=await store.get(indexedDB,fork);
                const summaries=await store.list(indexedDB);
                return {a:{revision:a.revision,stage:a.checkpoint.payload.draft.stage},
                    b:{forkOf:b.forkOf,stage:b.checkpoint.payload.draft.stage,
                       revision:b.revision,photo:b.photo},
                    ids:summaries.filter(s=>s.id===parent||s.id===fork).map(s=>s.id)};
            }""",{'parent':parent,'fork':fork})
            self.assertEqual(saved['a'],committed)
            self.assertEqual(saved['b']['forkOf'],parent)
            self.assertEqual(saved['b']['stage'],'result')
            self.assertIsNone(saved['b']['photo'])
            self.assertGreaterEqual(saved['b']['revision'],1)
            self.assertCountEqual(saved['ids'],[parent,fork])

            # A stale tab cannot delete the winner using an old list revision.
            rejected=other.evaluate("""async ({id,revision}) => {
                try {
                    await CurvatureModernCalibrationProjectStore.remove(indexedDB,id,revision);
                    return 'unexpectedly deleted';
                } catch(error) { return String(error.message); }
            }""",{'id':parent,'revision':initial})
            self.assertIn('changed in another tab; delete rejected',rejected)

            # Both durable candidates survive a genuine second-tab reload.
            other.reload(wait_until='load',timeout=30000)
            restored=other.evaluate("""async ({parent,fork}) => {
                const store=CurvatureModernCalibrationProjectStore;
                const a=await store.get(indexedDB,parent),b=await store.get(indexedDB,fork);
                return {a:a?.checkpoint.payload.draft.stage,
                    b:b?.checkpoint.payload.draft.stage,forkOf:b?.forkOf};
            }""",{'parent':parent,'fork':fork})
            self.assertEqual(restored,{'a':'calibration','b':'result','forkOf':parent})
            self.assertFalse(other_errors,other_errors)
            self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],
                             self.console)
        finally:
            other.close()


    def test_calibration_project_indexeddb_abort_retains_unsaved_retry(self):
        # Exercise a genuine IndexedDB write transaction with an injected
        # QuotaExceededError at the compact summary put. The project record
        # must roll back atomically, and the editor must retain a retryable
        # snapshot without silently acknowledging a partial commit.
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        self.page.once('dialog',lambda dialog:dialog.accept('Quota recovery'))
        panel.locator('#ModernCalibrationProjectsNew').click()
        expect(panel).to_be_hidden(timeout=30000)
        status="""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus()"""
        project_id=self.page.evaluate(status)['projectId']
        self.assertIsNotNone(project_id)
        before=self.page.evaluate("""async id => {
            const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
            return {revision:p.revision,stage:p.checkpoint.payload.draft.stage};
        }""",project_id)
        self.assertEqual(before['stage'],'correspondences')

        # Patch only this isolated Chromium context, restore in finally.
        self.page.evaluate("""() => {
            const original=IDBObjectStore.prototype.put;
            window.__calibrationQuotaPut=original;
            window.__calibrationQuotaHits=0;
            IDBObjectStore.prototype.put=function(...args){
                if(this.name==='project-summaries'){
                    window.__calibrationQuotaHits++;
                    // Stage changes can queue more than one autosave.
                    // Keep failing until the test explicitly restores IDB.
                    throw new DOMException('Injected quota exhaustion','QuotaExceededError');
                }
                return original.apply(this,args);
            };
        }""")
        try:
            workspace.locator('[data-calibration-stage="calibration"]').click()
            self.page.wait_for_function("""() => {
                const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                return s?.unsaved && s.pending===0 && !!s.error;
            }""",timeout=30000)
            failed=self.page.evaluate(status)
            self.assertEqual(failed['projectId'],project_id)
            self.assertIn('Injected quota exhaustion',failed['error'])
            self.assertEqual(failed['revision'],before['revision'])
            self.assertEqual(workspace.get_attribute('data-calibration-stage'),'calibration')
            durable=self.page.evaluate("""async id => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return {revision:p.revision,stage:p.checkpoint.payload.draft.stage};
            }""",project_id)
            self.assertEqual(durable,before,'failed transaction must not partially commit')

            workspace.locator('#ModernCalibrationProjectsToggle').click()
            retry=panel.locator('#ModernCalibrationProjectsSave')
            expect(retry).to_be_visible(timeout=30000)
            expect(retry).to_be_enabled()
            expect(retry).to_have_text('Retry save')
            expect(panel.locator('#ModernCalibrationProjectsStatus')).to_contain_text(
                'Save failed:',timeout=30000)

            # Restore the actual browser store and retry the captured state.
            self.page.evaluate("""() => {
                IDBObjectStore.prototype.put=window.__calibrationQuotaPut;
            }""")
            retry.click()
            self.page.wait_for_function("""id => {
                const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                return s?.projectId===id && !s.unsaved && s.pending===0 &&
                    !s.error && s.revision>1;
            }""",arg=project_id,timeout=30000)
            expect(panel.locator('#ModernCalibrationProjectsStatus')).to_contain_text(
                'saved in this browser',timeout=30000)
            committed=self.page.evaluate("""async id => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return {revision:p.revision,stage:p.checkpoint.payload.draft.stage};
            }""",project_id)
            self.assertEqual(committed['revision'],before['revision']+1)
            self.assertEqual(committed['stage'],'calibration')
            self.page.reload(wait_until='load',timeout=30000)
            after=self.page.evaluate("""async id => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return {revision:p.revision,stage:p.checkpoint.payload.draft.stage};
            }""",project_id)
            self.assertEqual(after,committed)
            self.assertEqual(self.page.evaluate("""() =>
                CurvatureModernPhotoCalibrationEditor.mount(document).projectBinding()"""),None,
                'reload must not silently activate a project')
        finally:
            self.page.evaluate("""() => {
                if(window.__calibrationQuotaPut)
                    IDBObjectStore.prototype.put=window.__calibrationQuotaPut;
                delete window.__calibrationQuotaPut;
            }""")
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],
                         self.console)

    def test_calibration_project_apply_links_reused_result_in_two_independent_projects(self):
        import json
        workspace=self.open_physical_calibration()
        data=self.soundly_calibration_experiment()
        data=self.page.evaluate("""data => {
            const {model,physics}=data.scene,rows=data.observations;
            const freeParameters=data.fit.freeParameters;
            const points=rows.map(row=>({id:row.landmark.id,status:'visible',
                observed:row.pixel,predicted:[row.pixel[0]+3,row.pixel[1]+4],weight:row.weight}));
            data.fit.result={status:'stalled',method:'canvas-direct',atmosphere:physics.atmosphere,
                pose:{...model,Height:42.8},freeParameters,initialRmsPx:300,
                evaluations:2,acceptedSteps:1,
                evaluation:{valid:true,rmsPx:5,weightedRmsPx:5,
                    cost:points.reduce((s,p)=>s+25*p.weight/2,0),points},
                materialBinding:CurvatureModernPhotoCalibrationEditor.fitBinding(
                    rows,freeParameters,model,physics,1176,791)};
            return data;
        }""",data)
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        panel.locator('#ModernCalibrationProjectsImportFile').set_input_files({
            'name':'linked-calibration.json','mimeType':'application/json',
            'buffer':json.dumps(data).encode('utf-8')})
        original=panel.locator('[data-calibration-project-id]').filter(
            has_text='Soundly regression raster')
        expect(original).to_have_count(1,timeout=30000)
        a=original.get_attribute('data-calibration-project-id')
        original.locator('[data-calibration-project-duplicate]').click()
        duplicate=panel.locator('[data-calibration-project-id]').filter(
            has_text='Soundly regression raster.png (copy)')
        expect(duplicate).to_have_count(1,timeout=30000)
        b=duplicate.get_attribute('data-calibration-project-id')
        self.assertNotEqual(a,b)
        for selected in [a,b]:
            panel.locator('[data-calibration-project-id="'+selected+'"] [data-calibration-project-open]').click()
            expect(panel).to_be_hidden(timeout=30000)
            button=workspace.locator('#ModernCalibrationApplyScene')
            expect(button).to_be_enabled(timeout=30000)
            self.assertEqual(self.page.evaluate("""() =>
                CurvatureModernPhotoCalibrationEditor.mount(document).projectBinding()?.projectId"""),
                selected)
            self.page.once('dialog',lambda dialog:dialog.accept())
            button.click()
            expect(workspace.locator('#ModernCalibrationApplyStatus')).to_contain_text(
                'Applied to Scene',timeout=30000)
            self.page.wait_for_function("""async id => {
                const record=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return record?.resultIds.length===1;
            }""",arg=selected,timeout=30000)
            expect(self.page.locator('#ModernPresetSwitchStatus')).to_contain_text(
                'Save Snapshot to keep this Scene',timeout=30000)
            self.page.locator('#ModernPhotoCalibrationOpen').click()
            workspace.locator('#ModernCalibrationProjectsToggle').click()
            expect(panel).to_be_visible()
        for selected in [a,b]:
            expect(panel.locator('[data-calibration-project-id="'+selected+'"]')).to_contain_text(
                '1 linked archived result',timeout=30000)
        links=self.page.evaluate("""async ids => {
            const projects=CurvatureModernCalibrationProjectStore;
            const archive=CurvatureModernCalibrationResultArchive;
            const x=await projects.get(indexedDB,ids[0]),y=await projects.get(indexedDB,ids[1]);
            const records=await archive.list(indexedDB);
            const images=await CurvatureModernReferenceImageLibrary.list(indexedDB);
            return {a:x.resultIds,b:y.resultIds,archiveCount:records.length,
                photoCount:images.length,provenance:(await archive.get(indexedDB,records[0].id)).record.provenance.projectId,
                embedded:JSON.stringify([x,y]).includes('data:image')};
        }""",[a,b])
        self.assertEqual(len(links['a']),1)
        self.assertEqual(links['a'],links['b'])
        self.assertEqual(links['archiveCount'],1)
        self.assertEqual(links['photoCount'],1)
        self.assertEqual(links['provenance'],a)
        self.assertFalse(links['embedded'])
        # Deleting one project never cascades into the shared scientific
        # archive, original photo, or the other project's durable link.
        self.page.once('dialog',lambda dialog:dialog.accept())
        panel.locator('[data-calibration-project-id="'+a+'"] [data-calibration-project-delete]').click()
        expect(panel.locator('[data-calibration-project-id="'+a+'"]')).to_have_count(0,timeout=30000)
        self.page.reload(wait_until='load')
        durable=self.page.evaluate("""async ids => {
            const project=await CurvatureModernCalibrationProjectStore.get(indexedDB,ids[1]);
            const removed=await CurvatureModernCalibrationProjectStore.get(indexedDB,ids[0]);
            const results=await CurvatureModernCalibrationResultArchive.list(indexedDB);
            const images=await CurvatureModernReferenceImageLibrary.list(indexedDB);
            return {removed:removed===null,resultIds:project.resultIds,
                results:results.length,images:images.length};
        }""",[a,b])
        self.assertTrue(durable['removed'])
        self.assertEqual(durable['resultIds'],links['b'])
        self.assertEqual((durable['results'],durable['images']),(1,1))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_calibration_atmosphere_retains_observations_and_changes_worker_projection(self):
        workspace=self.open_physical_calibration()
        data=self.soundly_calibration_experiment()
        self.import_calibration_experiment(data)
        workspace.locator('[data-calibration-stage="calibration"]').click()
        select=workspace.locator('#ModernCalibrationAtmosphere')
        profile=workspace.locator('#ModernCalibrationTemperatureProfile')
        status=workspace.locator('#ModernCalibrationEffectiveRadius')
        expect(select).to_have_value('vacuum')
        expect(profile).to_be_hidden()
        expect(status).to_contain_text('Initial effective R:')
        read=lambda: self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()")
        vacuum=read()
        select.select_option('standard')
        expect(status).to_contain_text('Initial effective R:')
        expect(profile).to_be_hidden()
        standard=read()
        self.assertEqual(standard['scene']['physics']['atmosphere'],'standard')
        self.assertEqual(standard['scene']['model'],vacuum['scene']['model'])
        self.assertEqual(standard['observations'],vacuum['observations'])
        self.assertEqual(standard['referenceImage'],vacuum['referenceImage'])
        select.select_option('temperature-lapse')
        expect(profile).to_be_visible()
        gradient=workspace.locator('#ModernCalibrationGradient')
        gradient.fill('10')
        gradient.press('Tab')
        changed=read()
        self.assertEqual(changed['scene']['physics']['temperatureProfile']['gradientKPerKm'],10)
        self.assertEqual(changed['observations'],vacuum['observations'])
        self.assertEqual(changed['scene']['model'],vacuum['scene']['model'])
        self.assertIsNone(changed['fit']['result'])
        # Real worker: identical observations, different refraction hypotheses.
        projections=self.page.evaluate("""async experiments => {
            const out=[];
            for(const data of experiments){
                const worker=new Worker('src/calibration/CameraCalibrationWorker.js');
                try{
                    const result=await new Promise((resolve,reject)=>{
                        const timer=setTimeout(()=>reject(Error('Worker timeout')),30000);
                        worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};
                        worker.onmessage=e=>{
                            if(e.data.type==='complete'){clearTimeout(timer);resolve(e.data.result);}
                            if(e.data.type==='error'){clearTimeout(timer);reject(Error(e.data.message));}
                        };
                        worker.postMessage({model:data.scene.model,input:data.observations,
                            options:{...data.scene.physics,width:1176,height:791,
                            freeParameters:[],maxIterations:1}});
                    });
                    out.push({atmosphere:result.atmosphere,points:result.evaluation.points.map(p=>p.predicted)});
                }finally{worker.terminate();}
            }
            return out;
        }""",[vacuum,standard,changed])
        self.assertEqual([p['atmosphere'] for p in projections],['vacuum','standard','temperature-lapse'])
        self.assertNotEqual(projections[0]['points'],projections[1]['points'])
        self.assertNotEqual(projections[1]['points'],projections[2]['points'])
        expect(workspace.locator('#ModernCalibrationStorage')).to_have_text('Draft saved in this browser.',timeout=30000)
        self.page.reload(wait_until='load')
        expect(select).to_have_value('temperature-lapse',timeout=30000)
        expect(gradient).to_have_value('10')
        self.assertEqual(read()['observations'],vacuum['observations'])
        # Run a genuine UI fit for the edited hypothesis, then apply it.
        # Free only Height here; the full seven-parameter worker is covered
        # by the separate numerical Soundly and end-to-end qualifications.
        for field in ['CameraEast','CameraNorth','Pan','Nick','Roll','FocalLengthField']:
            workspace.locator('[data-fit-field="'+field+'"]').uncheck()
        workspace.locator('#ModernCalibrationRunFit').click()
        button=workspace.locator('#ModernCalibrationApplyScene')
        expect(button).to_be_visible(timeout=90000)
        expect(button).to_be_enabled(timeout=90000)
        fitted=read()
        self.assertEqual(fitted['fit']['result']['atmosphere'],'temperature-lapse')
        self.assertTrue(fitted['fit']['result']['evaluation']['valid'])
        self.assertEqual(len(fitted['fit']['result']['evaluation']['points']),14)
        self.page.once('dialog',lambda prompt:prompt.accept())
        button.click()
        expect(self.page.locator('#ModernPresetSwitchStatus')).to_contain_text('Save Snapshot to keep this Scene',timeout=30000)
        actual=self.page.evaluate("CurvatureModernApp.getPhotoCalibrationScene()")
        self.assertEqual(actual['model']['rEarth'],vacuum['scene']['model']['rEarth'])
        self.assertEqual(actual['physics'],fitted['scene']['physics'])
        self.assertAlmostEqual(actual['model']['Height'],fitted['fit']['result']['pose']['Height'])
        archive_before=self.page.evaluate("""async () => {
            const api=CurvatureModernCalibrationResultArchive;
            const rows=await api.list(indexedDB);
            return (await api.get(indexedDB,rows[0].id)).record;
        }""")
        self.assertEqual(archive_before['payload']['scene']['physics'],fitted['scene']['physics'])
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(button).to_be_enabled()
        # Changing the hypothesis after Apply keeps the archive, but drops
        # the now-stale editable fit and retains all measured points.
        self.page.once('dialog',lambda prompt:prompt.dismiss())
        select.select_option('standard')
        expect(select).to_have_value('temperature-lapse')
        self.assertEqual(read()['fit']['result'],fitted['fit']['result'])
        self.page.once('dialog',lambda prompt:prompt.accept())
        select.select_option('standard')
        expect(select).to_have_value('standard')
        self.assertIsNone(read()['fit']['result'])
        self.assertEqual(read()['observations'],vacuum['observations'])
        expect(button).to_be_disabled()
        self.assertEqual(self.page.evaluate("""async id =>
            (await CurvatureModernCalibrationResultArchive.get(indexedDB,id)).record""",
            archive_before['id']),archive_before)
        # Returning to Scene without Apply does not change its atmosphere.
        self.page.locator('#ModernSceneTab').click()
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoCalibrationScene().physics"),actual['physics'])
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_calibration_apply_button_scene_and_previous(self):
        workspace=self.open_physical_calibration()
        button=workspace.locator('#ModernCalibrationApplyScene')
        data=self.soundly_calibration_experiment()
        self.import_calibration_experiment(data)
        workspace.locator('[data-calibration-stage="result"]').click()
        expect(button).to_be_disabled()
        # Imported stable candidate; full numerical worker qualification
        # remains in test_soundly_calibration_foundation_end_to_end.
        data=self.page.evaluate("""data => {
            const {model,physics}=data.scene, rows=data.observations;
            const freeParameters=data.fit.freeParameters, points=rows.map(row=>({
                id:row.landmark.id,status:'visible',observed:row.pixel,
                predicted:[row.pixel[0]+3,row.pixel[1]+4],weight:row.weight
            }));
            data.fit.result={status:'stalled',method:'canvas-direct',atmosphere:physics.atmosphere,
                pose:{...model,Height:42.8},freeParameters,initialRmsPx:300,evaluations:2,acceptedSteps:1,
                evaluation:{valid:true,rmsPx:5,weightedRmsPx:5,cost:points.reduce((s,p)=>s+25*p.weight/2,0),points},
                materialBinding:CurvatureModernPhotoCalibrationEditor.fitBinding(rows,freeParameters,model,physics,1176,791)};
            return data;
        }""",data)
        self.import_calibration_experiment(data,replace=True)
        expect(button).to_be_enabled()
        outgoing=self.page.evaluate("CurvatureModernApp.getModel().Height")
        self.page.once('dialog',lambda prompt:prompt.dismiss())
        button.click()
        expect(workspace).to_be_visible()
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getModel().Height"),outgoing)
        self.page.once('dialog',lambda prompt:prompt.accept())
        button.click()
        expect(self.page.locator('#ModernSceneTab')).to_have_attribute('aria-pressed','true',timeout=30000)
        expect(self.page.locator('#ModernPresetSwitchStatus')).to_contain_text('Save Snapshot to keep this Scene',timeout=30000)
        self.assertAlmostEqual(self.page.evaluate("CurvatureModernApp.getModel().Height"),42.8)
        saved=self.page.evaluate("""async () => {
            const records=await CurvatureModernCalibrationResultArchive.list(indexedDB);
            const history=await CurvatureModernApp.getHistoryStore().list();
            return {count:records.length,backup:history.some(r=>r.pinned&&r.source==='recovery'&&r.experiment.scene.camera.Height!==42.8)};
        }""")
        self.assertEqual(saved,{'count':1,'backup':True})
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(workspace).to_be_visible()
        expect(button).to_be_enabled()
        self.assertEqual(self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).fitResult().pose.Height"),42.8)
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernPreviousExperiment').click()
        expect(self.page.locator('#ModernPreset')).to_have_value('pontchartrain',timeout=30000)
        self.assertAlmostEqual(self.page.evaluate("CurvatureModernApp.getModel().Height"),outgoing)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)



    def test_calibration_explicit_destination_controls(self):
        workspace=self.open_physical_calibration()
        data=self.soundly_calibration_experiment()
        target=workspace.locator('#ModernCalibrationApplyTarget')
        button=workspace.locator('#ModernCalibrationApplyScene')
        status=workspace.locator('#ModernCalibrationApplyStatus')
        description=workspace.locator('#ModernCalibrationApplyDescription')
        self.import_calibration_experiment(data)
        workspace.locator('[data-calibration-stage="result"]').click()
        expect(target).to_have_value('Scene')
        expect(target).to_be_disabled()
        expect(button).to_be_disabled()
        data=self.page.evaluate("""data => {
            const {model,physics}=data.scene,rows=data.observations;
            const freeParameters=data.fit.freeParameters,points=rows.map(row=>({
                id:row.landmark.id,status:'visible',observed:row.pixel,
                predicted:[row.pixel[0]+3,row.pixel[1]+4],weight:row.weight
            }));
            data.fit.result={status:'stalled',method:'canvas-direct',atmosphere:physics.atmosphere,
                pose:{...model,Height:42.8},freeParameters,initialRmsPx:300,evaluations:2,acceptedSteps:1,
                evaluation:{valid:true,rmsPx:5,weightedRmsPx:5,cost:points.reduce((s,p)=>s+25*p.weight/2,0),points},
                materialBinding:CurvatureModernPhotoCalibrationEditor.fitBinding(rows,freeParameters,model,physics,1176,791)};
            return data;
        }""",data)
        self.import_calibration_experiment(data,replace=True)
        expect(target).to_be_enabled()
        expect(target).to_have_value('Scene')
        expect(button).to_have_text('Apply Best Camera to Scene')
        read=lambda: self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()")
        draft=read()
        target.select_option('B')
        expect(button).to_have_text('Apply Best Camera to Compare B')
        expect(description).to_contain_text('Compare A retains its physics')
        expect(description).to_contain_text('shared visibility')
        self.assertEqual(read(),draft)
        prompts=[]
        def dismiss(dialog):
            prompts.append(dialog.message)
            dialog.dismiss()
        self.page.once('dialog',dismiss)
        button.click()
        self.assertIn('to Compare B?',prompts[0])
        self.assertIn('Both Compare panels',prompts[0])
        expect(workspace).to_be_visible()
        self.assertEqual(read(),draft)
        self.assertEqual(self.page.evaluate("CurvatureModernCalibrationResultArchive.list(indexedDB)"),[])
        # Hold the actual archival acknowledgement. The user's destination
        # is locked even when a synthetic change event reaches the select.
        self.page.evaluate("""() => {
            const api=CurvatureModernCalibrationResultArchive;
            const gate={ready:false,release:null,restore:()=>{window.CurvatureModernCalibrationResultArchive=api;}};
            window.__destinationGate=gate;
            window.CurvatureModernCalibrationResultArchive={...api,async archiveExperiment(...args){
                const saved=await api.archiveExperiment(...args);
                await new Promise(resolve=>{gate.release=resolve;gate.ready=true;});
                return saved;
            }};
        }""")
        try:
            self.page.once('dialog',lambda dialog:dialog.accept())
            button.click()
            self.page.wait_for_function("window.__destinationGate.ready",timeout=30000)
            expect(target).to_be_disabled()
            expect(button).to_be_disabled()
            target.evaluate("(el)=>{el.value='A';el.dispatchEvent(new Event('change',{bubbles:true}));}")
            expect(target).to_have_value('B')
            self.page.evaluate("window.__destinationGate.release()")
            expect(status).to_contain_text('Applied to Compare B. Calibration draft retained.',timeout=30000)
            expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed','true')
            expect(self.page.locator('#ModernModelTabB')).to_have_attribute('aria-pressed','true')
        finally:
            self.page.evaluate("""() => {
                const gate=window.__destinationGate;
                if(gate.release)gate.release();gate.restore();
            }""")
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(target).to_be_enabled(timeout=30000)
        self.assertEqual(read(),draft)
        target.select_option('A')
        expect(button).to_have_text('Apply Best Camera to Compare A')
        expect(description).to_contain_text('Compare B retains its physics')
        self.page.once('dialog',lambda dialog:dialog.accept())
        button.click()
        expect(status).to_contain_text('Applied to Compare A. Calibration draft retained.',timeout=30000)
        expect(self.page.locator('#ModernModelTabA')).to_have_attribute('aria-pressed','true')
        self.assertEqual(self.page.evaluate("""() => JSON.parse(
            localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY)).calibrationOrigin.target"""),'A')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)


    def test_archived_scene_transition_and_compare_applicability(self):
        workspace=self.open_physical_calibration()
        data=self.soundly_calibration_experiment()
        data=self.page.evaluate("""data => {
            const {model,physics}=data.scene,rows=data.observations;
            const freeParameters=data.fit.freeParameters,points=rows.map(row=>({
                id:row.landmark.id,status:'visible',observed:row.pixel,
                predicted:[row.pixel[0]+3,row.pixel[1]+4],weight:row.weight
            }));
            data.fit.result={status:'stalled',method:'canvas-direct',atmosphere:physics.atmosphere,
                pose:{...model,Height:42.8},freeParameters,initialRmsPx:300,evaluations:2,acceptedSteps:1,
                evaluation:{valid:true,rmsPx:5,weightedRmsPx:5,cost:points.reduce((s,p)=>s+25*p.weight/2,0),points},
                materialBinding:CurvatureModernPhotoCalibrationEditor.fitBinding(rows,freeParameters,model,physics,1176,791)};
            return data;
        }""",data)
        self.import_calibration_experiment(data)
        button=workspace.locator('#ModernCalibrationApplyScene')
        expect(button).to_be_enabled(timeout=30000)
        self.page.once('dialog',lambda dialog:dialog.accept())
        button.click()
        scene_status=self.page.locator('#ModernCalibrationApplicabilityScene')
        to_b=self.page.locator('#ModernCalibrationSceneToB')
        expect(scene_status).to_contain_text('Calibrated',timeout=30000)
        expect(to_b).to_be_enabled(timeout=30000)
        expect(self.page.locator('#ModernPresetSwitchStatus')).to_contain_text('Save Snapshot to keep this Scene',timeout=30000)
        # A derived, edited Scene is still explicitly re-applicable.
        self.page.evaluate("""() => {
            const m=CurvatureModernApp.getModel();m.Height+=7;m.Update();
            document.getElementById('ModernRender').click();
        }""")
        expect(scene_status).to_contain_text('associated fit inputs changed',timeout=30000)
        expect(self.page.locator('#ModernPersistenceStatus')).to_have_text('Working session saved',timeout=30000)
        outgoing=self.page.evaluate("""() => JSON.parse(localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY))""")
        # Archive-only transition deliberately works without the photo.
        clear="""apiName => new Promise((resolve,reject)=>{
            const api=window[apiName],request=indexedDB.open(api.DATABASE);
            request.onerror=()=>reject(request.error);
            request.onsuccess=()=>{
                const db=request.result,tx=db.transaction(api.STORE,'readwrite');
                tx.oncomplete=()=>{db.close();resolve();};
                tx.onabort=()=>{db.close();reject(tx.error);};
                tx.objectStore(api.STORE).clear();
            };
        })"""
        self.page.evaluate(clear,'CurvatureModernReferenceImageLibrary')
        self.page.once('dialog',lambda dialog:dialog.dismiss())
        to_b.click()
        expect(self.page.locator('#ModernSceneTab')).to_have_attribute('aria-pressed','true')
        self.assertAlmostEqual(self.page.evaluate("CurvatureModernApp.getModel().Height"),49.8)
        self.page.once('dialog',lambda dialog:dialog.accept())
        to_b.click()
        expect(self.page.locator('#ModernPresetSwitchStatus')).to_contain_text('Save Snapshot to keep this Compare',timeout=30000)
        a=self.page.locator('#ModernCalibrationApplicabilityA')
        b=self.page.locator('#ModernCalibrationApplicabilityB')
        expect(a).to_contain_text('Derived · no independent fit',timeout=30000)
        expect(b).to_contain_text('Calibrated · archived fit inputs match')
        self.assertAlmostEqual(self.page.evaluate("CurvatureModernApp.getModel().Height"),42.8)
        self.assertTrue(self.page.evaluate("""async outgoing => {
            const rows=await CurvatureModernApp.getHistoryStore().list();
            const f=CurvatureModernExperimentFingerprint;
            return rows.some(row=>row.pinned&&f.exactSignature(row.experiment)===f.exactSignature(outgoing));
        }""",outgoing))
        # Side-only physics changes do not invalidate the associated B.
        self.page.locator('#ModernModelTabA').click()
        self.page.evaluate("""() => {
            const n=document.getElementById('ModernModelAtmosphere');
            n.value='standard';n.dispatchEvent(new Event('change',{bubbles:true}));
        }""")
        expect(b).to_contain_text('Calibrated')
        self.page.evaluate("""() => {
            const m=CurvatureModernApp.getModel();m.Height+=2;m.Update();
            document.getElementById('ModernRecalculateCompare').click();
        }""")
        expect(b).to_contain_text('associated fit inputs changed')
        expect(a).to_contain_text('no independent fit')
        self.page.evaluate(clear,'CurvatureModernCalibrationResultArchive')
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernCompareTab').click()
        expect(b).to_contain_text('Archive result missing',timeout=30000)
        expect(a).to_contain_text('No independent fit')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_calibration_compare_host_apply_and_partial_render(self):
        # Direct host entry point only; destination controls belong to .3.
        # Synthetic imported fit qualifies transaction/presentation plumbing,
        # not a fresh fit or physical agreement with the original image.
        self.open_modern()
        self.page.locator('#ModernRender').click()
        expect(self.page.locator('#ModernPersistenceStatus')).to_have_text(
            'Working session saved',timeout=30000)
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        workspace=self.page.locator('#ModernPhotoCalibration')
        expect(workspace).to_be_visible()
        data=self.soundly_calibration_experiment()
        data=self.page.evaluate("""data => {
            const {model,physics}=data.scene,rows=data.observations;
            const freeParameters=data.fit.freeParameters,points=rows.map(row=>({
                id:row.landmark.id,status:'visible',observed:row.pixel,
                predicted:[row.pixel[0]+3,row.pixel[1]+4],weight:row.weight
            }));
            data.fit.result={status:'stalled',method:'canvas-direct',atmosphere:physics.atmosphere,
                pose:{...model,Height:42.8},freeParameters,initialRmsPx:300,evaluations:2,acceptedSteps:1,
                evaluation:{valid:true,rmsPx:5,weightedRmsPx:5,cost:points.reduce((s,p)=>s+25*p.weight/2,0),points},
                materialBinding:CurvatureModernPhotoCalibrationEditor.fitBinding(rows,freeParameters,model,physics,1176,791)};
            return data;
        }""",data)
        self.import_calibration_experiment(data)
        ready=self.page.locator('#ModernCalibrationApplyScene')
        expect(ready).to_be_enabled(timeout=30000)
        # Keep the real editor draft and archive. Choose destinations only
        # through the new host API, without changing any public control.
        exercise="""async ({target,partial}) => {
            const app=CurvatureModernApp,editor=CurvatureModernPhotoCalibrationEditor.mount(document);
            const fitted=editor.exportExperiment(),sceneBefore=app.getPhotoCalibrationScene();
            // Scene can retain an uninitialized runtime Compare pair. Read
            // the canonical outgoing checkpoint that Apply protects, not
            // an optional runtime cache. The checkpoint already contains
            // the same default pair that experimentSnapshot() supplies.
            const outgoing=CurvatureModernExperimentState.validate(JSON.parse(
                localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY)));
            const before=outgoing.compare,runtimeBefore=app.getCompareConfig();
            if(runtimeBefore&&['A','B'].some(side=>
                JSON.stringify(runtimeBefore[side])!==JSON.stringify(before[side])))
                throw Error('Outgoing checkpoint does not match live Compare physics');
            const oldA=app.getCompareLast().A,oldB=app.getCompareLast().B;
            if(partial)app.registerCompareGraph('B',{UpdateCanvasSize(){},Redraw(){}});
            let result=null,error=null;
            try{
                result=await app.applyCalibrationToTarget({
                    candidate:()=>editor.exportExperiment(),revision:()=>0,saveDraft:async()=>{}
                },target);
            }catch(e){error={message:e.message,phase:e.phase,committed:e.committed,
                target:e.target,recoveryId:e.recoveryId,resultId:e.resultId};}
            const pair=app.getCompareModels(),last=app.getCompareLast(),config=app.getCompareConfig();
            const sceneAfter=app.getPhotoCalibrationScene();
            const history=await app.getHistoryStore().list();
            const rid=(result||error)?.recoveryId;
            const recovery=history.find(row=>row.id===rid);
            const saved=JSON.parse(localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY));
            return {result,error,mode:app.getWorkspaceMode(),quality:app.getOpticalQuality(),
                selected:app.getWorkspaceState().compareModel,config,before,
                bothFresh:!!last.A&&!!last.B&&oldA!==last.A&&oldB!==last.B,
                aReady:!!last.A,bReady:!!last.B,
                invariant:!!pair&&CurvatureModernCompareModel.invariant(pair),
                aim:pair&&[pair.A.viewcenterHorizon,pair.B.viewcenterHorizon],
                cameras:pair&&Object.fromEntries(['A','B'].map(side=>[side,
                    Object.fromEntries(Object.keys(fitted.fit.result.pose).filter(
                        k=>['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'].includes(k))
                        .map(k=>[k,pair[side][k]]))])),
                objects:pair&&Object.fromEntries(['A','B'].map(side=>[side,
                    Object.fromEntries(CurvatureModernExperimentState.OBJECT.map(k=>[k,pair[side][k]]))])),
                sceneBefore:{physics:sceneBefore.physics,surface:[sceneBefore.model.showModel,sceneBefore.model.rEarth]},
                sceneAfter:{physics:sceneAfter.physics,surface:[sceneAfter.model.showModel,sceneAfter.model.rEarth]},
                recovery:recovery&&{pinned:recovery.pinned,config:recovery.experiment.compare,
                    exact:CurvatureModernExperimentFingerprint.exactSignature(recovery.experiment)===
                        CurvatureModernExperimentFingerprint.exactSignature(outgoing)},
                hadRuntimePair:!!runtimeBefore,hadOldA:!!oldA,hadOldB:!!oldB,
                origin:saved.calibrationOrigin,checkpointSelected:saved.compare.selected};
        }"""
        for index,(target,partial) in enumerate([('A',False),('B',False),('A',True)]):
            if self.page.evaluate("CurvatureModernApp.getWorkspaceMode()")!='calibration':
                self.page.locator('#ModernPhotoCalibrationOpen').click()
                expect(workspace).to_be_visible()
                expect(ready).to_be_enabled(timeout=30000)
            outcome=self.page.evaluate(exercise,{'target':target,'partial':partial})
            if index==0:
                self.assertFalse(outcome['hadRuntimePair'])
            else:
                self.assertTrue(outcome['hadRuntimePair'])
                self.assertTrue(outcome['hadOldA'])
                self.assertTrue(outcome['hadOldB'])
            if partial:
                self.assertIsNone(outcome['result'])
                self.assertEqual(outcome['error']['phase'],'present')
                self.assertTrue(outcome['error']['committed'])
                self.assertEqual(outcome['error']['target'],target)
                self.assertIn('Compare B renderer did not complete',outcome['error']['message'])
                self.assertTrue(outcome['aReady'])
                self.assertFalse(outcome['bReady'])
            else:
                self.assertIsNone(outcome['error'],outcome)
                self.assertEqual(outcome['result']['target'],target)
                self.assertTrue(outcome['bothFresh'])
            self.assertEqual(outcome['mode'],'compare')
            self.assertEqual(outcome['quality'],'accurate')
            self.assertEqual(outcome['selected'],target)
            self.assertEqual(outcome['checkpointSelected'],target)
            self.assertEqual(outcome['origin']['target'],target)
            self.assertTrue(outcome['invariant'])
            self.assertEqual(outcome['aim'],[3,3])
            self.assertEqual(outcome['sceneBefore'],outcome['sceneAfter'])
            other='B' if target=='A' else 'A'
            self.assertEqual(outcome['config'][target]['atmosphere'],data['scene']['physics']['atmosphere'])
            self.assertEqual(outcome['config'][other],{**outcome['before'][other],
                             'visibility':{'enabled':False,'rangeKm':60}})
            for side in ['A','B']:
                for field,value in outcome['cameras'][side].items():
                    self.assertAlmostEqual(value,data['fit']['result']['pose'][field],places=7)
                for field,value in outcome['objects'][side].items():
                    self.assertEqual(value,data['scene']['model'][field])
            self.assertTrue(outcome['recovery']['pinned'])
            self.assertTrue(outcome['recovery']['exact'])
            for side in ['A','B']:
                self.assertEqual(outcome['recovery']['config'][side],outcome['before'][side])
            expect(self.page.locator('#ModernModelTab'+target)).to_have_attribute('aria-pressed','true')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)


    def test_compare_calibration_live_research_cycle_qualification(self):
        # One genuine UI/worker seven-parameter fit, with the existing
        # regression observations and synthetic storage raster. No claim
        # about a named original photograph or Accurate renderer RMS.
        self.open_modern()
        ready=self.page.locator('#ModernPhotoCalibrationOpen')
        expect(ready).to_be_enabled(timeout=30000)
        self.page.locator('#ModernCompareTab').click()
        preset_status=self.page.locator('#ModernPresetSwitchStatus')
        storage=self.page.locator('#ModernPersistenceStatus')
        ready_status=lambda side: self.page.locator('#ModernCalibrationApplicability'+side)
        fields=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField']
        def checkpoint(side=None,before=None):
            # Poll resolved IDB values explicitly. Playwright's page predicate
            # can treat an async Promise itself as truthy before it resolves.
            # History fingerprints intentionally ignore selected A/B; durable
            # checkpoint equality must include it.
            return self.page.evaluate("""async ({side,before}) => {
                const codec=CurvatureModernExperimentState,autosave=CurvatureModernSessionAutosave;
                const canonical=e=>JSON.stringify(codec.validate(e));
                const deadline=performance.now()+30000;
                let detail='';
                do {
                    const row=await autosave.read(indexedDB);
                    const local=JSON.parse(localStorage.getItem(codec.STORAGE_KEY));
                    const stamp=Number(localStorage.getItem(autosave.META_KEY));
                    if(row&&local){
                        const remote=row.experiment;
                        const matches=canonical(local)===canonical(remote);
                        detail=JSON.stringify({local:local.compare.selected,remote:remote.compare.selected,
                            stamp,remoteStamp:row.savedAt,matches});
                        if(matches&&stamp===row.savedAt&&(!side||remote.compare.selected===side)&&
                           (!before||canonical(before)===canonical(remote)))
                            return remote;
                    }
                    await new Promise(resolve=>setTimeout(resolve,50));
                }while(performance.now()<deadline);
                throw Error('Expected durable checkpoint not reached: '+detail);
            }""",{'side':side,'before':before})
        def configure_flat(side):
            self.page.locator('#ModernModelTab'+side).click()
            self.page.locator('#ModernSettingsSurface').click()
            expect(self.page.locator('#ModernComparePanelSurface')).to_be_visible()
            self.page.locator('#ModernModelFlat').click()
            self.page.locator('#ModernSettingsAtmosphere').click()
            expect(self.page.locator('#ModernComparePanelAtmosphere')).to_be_visible()
            self.page.locator('#ModernModelAtmosphere').select_option('standard')
            # Wait for the intended durable state, not a previous saved
            # status that can remain visible during the autosave debounce.
            self.page.wait_for_function("""side => {
                const e=JSON.parse(localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY));
                return e?.display.mode==='compare'&&e.compare.selected===side&&
                    e.compare[side].surface==='flat'&&e.compare[side].atmosphere==='standard';
            }""",arg=side,timeout=30000)
            e=checkpoint(side=side)
            self.assertEqual(e['compare']['selected'],side)
            self.assertEqual(e['compare'][side]['surface'],'flat')
            self.assertEqual(e['compare'][side]['atmosphere'],'standard')
            return e
        outgoing=configure_flat('B')
        self.assertEqual(outgoing['display']['mode'],'compare')
        ready.click()
        workspace=self.page.locator('#ModernPhotoCalibration')
        expect(workspace).to_be_visible()
        data=self.soundly_calibration_experiment()
        self.import_calibration_experiment(data)
        workspace.locator('[data-calibration-stage="calibration"]').click()
        workspace.locator('#ModernCalibrationRunFit').click()
        button=workspace.locator('#ModernCalibrationApplyScene')
        target=workspace.locator('#ModernCalibrationApplyTarget')
        status=workspace.locator('#ModernCalibrationApplyStatus')
        expect(button).to_be_enabled(timeout=120000)
        read=lambda: self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()")
        fitted=read()
        fit=fitted['fit']['result']
        self.assertFalse(fitted['fit']['running'])
        self.assertEqual(fit['freeParameters'],fields)
        self.assertTrue(fit['evaluation']['valid'])
        self.assertGreater(fit['acceptedSteps'],0)
        self.assertEqual(len(fit['evaluation']['points']),len(fitted['observations']))
        self.assertLess(fit['evaluation']['rmsPx'],fit['initialRmsPx'])
        expect(workspace.locator('#ModernCalibrationStorage')).to_have_text(
            'Draft saved in this browser.',timeout=30000)
        def draft_unchanged():
            current=read()
            for key in ['scene','observations','referenceImage']:
                self.assertEqual(current[key],fitted[key])
            self.assertEqual(current['fit']['result'],fit)
        def apply():
            self.page.once('dialog',lambda dialog:dialog.accept())
            button.click()
        def open_editor():
            ready.click()
            expect(workspace).to_be_visible()
            expect(button).to_be_enabled(timeout=30000)
            draft_unchanged()
        def history_rows():
            return self.page.evaluate("CurvatureModernApp.getHistoryStore().list()")
        def archive_rows():
            return self.page.evaluate("CurvatureModernCalibrationResultArchive.list(indexedDB)")
        def mark_old_renders():
            self.page.evaluate("""() => {
                const last=CurvatureModernApp.getCompareLast();
                window.__compareQualificationOld={A:last.A,B:last.B};
            }""")
        def verify_compare(side,before):
            expect(preset_status).to_contain_text('Save Snapshot to keep this Compare',timeout=30000)
            expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed','true')
            expect(self.page.locator('#ModernModelTab'+side)).to_have_attribute('aria-pressed','true')
            expect(ready_status(side)).to_contain_text('Calibrated · archived fit inputs match',timeout=30000)
            other='B' if side=='A' else 'A'
            expect(ready_status(other)).to_contain_text('Derived · no independent fit')
            current=checkpoint(side=side)
            self.assertEqual(current['display']['mode'],'compare')
            self.assertEqual(current['compare']['selected'],side)
            self.assertEqual(current['calibrationOrigin']['target'],side)
            self.assertEqual(current['compare'][side]['surface'],'globe')
            self.assertEqual(current['compare'][side]['atmosphere'],fitted['scene']['physics']['atmosphere'])
            self.assertEqual(current['compare'][other],{**before['compare'][other],
                             'visibility':{'enabled':False,'rangeKm':60}})
            for key in ['surface','atmosphere','occlusionRadius','temperatureProfile',
                        'transitionProfile','inverseProfile','visibility']:
                self.assertEqual(current['scene'][key],before['scene'][key])
            check=self.page.evaluate("""async ({before,current,fields}) => {
                const app=CurvatureModernApp,codec=CurvatureModernExperimentState,
                    fingerprint=CurvatureModernExperimentFingerprint;
                const pair=app.getCompareModels(),last=app.getCompareLast(),old=window.__compareQualificationOld;
                const record=(await CurvatureModernCalibrationResultArchive.get(
                    indexedDB,current.calibrationOrigin.resultId)).record;
                const result=CurvatureModernCalibrationTransfer.applicability(current,record);
                const key=e=>fingerprint.exactSignature(e);
                const rows=await app.getHistoryStore().list();
                const matching=rows.find(row=>row.pinned&&key(row.experiment)===key(before));
                const url=codec.urlWithExperiment(location.href,current);
                return {invariant:CurvatureModernCompareModel.invariant(pair),
                    fresh:!!last.A&&!!last.B&&last.A!==old.A&&last.B!==old.B,
                    accurate:app.getOpticalQuality()==='accurate',
                    aim:[pair.A.viewcenterHorizon,pair.B.viewcenterHorizon],
                    cameras:['A','B'].map(side=>Object.fromEntries(fields.map(k=>[k,pair[side][k]]))),
                    layouts:['A','B'].map(side=>Object.fromEntries(codec.OBJECT.map(k=>[k,pair[side][k]]))),
                    recovery:!!matching,verified:result.resultStatus,
                    json:key(codec.decode(codec.encode(current)))===key(current),
                    url:key(codec.readUrl(new URL(url).search))===key(current),
                    recordId:record.id,shareUrl:url};
            }""",{'before':before,'current':current,'fields':fields})
            for key in ['invariant','fresh','accurate','recovery','json','url']:
                self.assertTrue(check[key],key)
            self.assertEqual(check['verified'],'verified')
            self.assertEqual(check['aim'],[3,3])
            for camera in check['cameras']:
                for field in fields:
                    self.assertAlmostEqual(camera[field],fit['pose'][field],places=7)
            for layout in check['layouts']:
                for key,value in layout.items():
                    self.assertEqual(value,fitted['scene']['model'][key])
            self.assertEqual(check['recordId'],current['calibrationOrigin']['resultId'])
            return current,check['shareUrl']

        target.select_option('A')
        # Real write errors in each durable store must leave the outgoing
        # Compare untouched; prior Scene and host-level failure cases remain.
        initial_pinned=[row['id'] for row in history_rows() if row['pinned']]
        for store,count in [('archive',0),('history',1)]:
            self.page.evaluate("""store => {
                const proto=IDBDatabase.prototype,original=proto.transaction;
                const name=store==='archive'?CurvatureModernCalibrationResultArchive.DATABASE:
                    CurvatureModernExperimentHistory.DATABASE;
                window.__compareQualificationRestore=()=>{proto.transaction=original;};
                proto.transaction=function(stores,mode,...args){
                    if(this.name===name&&mode==='readwrite')throw Error('Compare '+store+' write rejected');
                    return original.call(this,stores,mode,...args);
                };
            }""",store)
            try:
                apply()
                expect(status).to_contain_text('Apply failed: Compare '+store+' write rejected',timeout=30000)
                expect(workspace).to_be_visible()
                expect(button).to_be_enabled()
                draft_unchanged()
            finally:
                self.page.evaluate("window.__compareQualificationRestore()")
            self.assertEqual(len(archive_rows()),count)
            self.assertCountEqual([row['id'] for row in history_rows() if row['pinned']],initial_pinned)
            self.assertEqual(self.page.evaluate("""() => JSON.parse(
                localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY))"""),outgoing)

        # Hold a durable acknowledgement, reject a competing Apply, and
        # navigate away/back to the same editor. No stale commit is allowed.
        self.page.evaluate("""() => {
            const api=CurvatureModernCalibrationResultArchive;
            const gate={ready:false,release:null,restore:()=>{window.CurvatureModernCalibrationResultArchive=api;}};
            window.__compareQualificationGate=gate;
            window.CurvatureModernCalibrationResultArchive={...api,async archiveExperiment(...args){
                const saved=await api.archiveExperiment(...args);
                await new Promise(resolve=>{gate.release=resolve;gate.ready=true;});
                return saved;
            }};
        }""")
        try:
            apply()
            self.page.wait_for_function("window.__compareQualificationGate.ready",timeout=30000)
            expect(target).to_be_disabled()
            rejected=self.page.evaluate("""async () => {
                try{await CurvatureModernApp.applyCalibrationToTarget({},'B');return false;}
                catch(error){return error.message.includes('pending experiment change');}
            }""")
            self.assertTrue(rejected)
            self.page.locator('#ModernCompareTab').click()
            expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed','true')
            ready.click()
            expect(workspace).to_be_visible()
            self.page.evaluate("window.__compareQualificationGate.release()")
            expect(status).to_contain_text('changed; apply again',timeout=30000)
            expect(button).to_be_enabled()
            draft_unchanged()
        finally:
            self.page.evaluate("""() => {
                const gate=window.__compareQualificationGate;
                if(gate.release)gate.release();gate.restore();
            }""")
        self.assertCountEqual([row['id'] for row in history_rows() if row['pinned']],initial_pinned)
        mark_old_renders()
        apply()
        expect(status).to_contain_text('Applied to Compare A. Calibration draft retained.',timeout=30000)
        calibrated_a,_=verify_compare('A',outgoing)
        self.assertEqual(calibrated_a['compare']['B']['surface'],'flat')
        self.assertEqual(calibrated_a['compare']['B']['atmosphere'],'standard')

        # Make the non-target A a genuinely different optical hypothesis
        # before applying to B; association must follow the explicit target.
        before_b=configure_flat('A')
        open_editor()
        target.select_option('B')
        mark_old_renders()
        apply()
        expect(status).to_contain_text('Applied to Compare B. Calibration draft retained.',timeout=30000)
        calibrated_b,share_url=verify_compare('B',before_b)
        self.assertEqual(calibrated_b['compare']['A']['surface'],'flat')
        self.assertEqual(calibrated_b['compare']['A']['atmosphere'],'standard')
        self.assertEqual(calibrated_a['calibrationOrigin']['resultId'],calibrated_b['calibrationOrigin']['resultId'])
        self.assertEqual(len(archive_rows()),1)

        # Real protected History restore (not a simulated state assignment).
        self.page.locator('#ModernPreviousExperiment').click()
        self.assertEqual(checkpoint(before=before_b),before_b)
        expect(ready_status('A')).to_contain_text('associated fit inputs changed')

        # Apply to Scene and use the new archive-only transition for both
        # explicit destinations; recover Scene in between.
        open_editor()
        target.select_option('Scene')
        apply()
        expect(status).to_contain_text('Applied to Scene. Calibration draft retained.',timeout=30000)
        expect(preset_status).to_contain_text('Save Snapshot to keep this Scene',timeout=30000)
        scene=checkpoint()
        self.assertEqual(scene['calibrationOrigin']['target'],'Scene')
        for side in ['A','B']:
            transfer=self.page.locator('#ModernCalibrationSceneTo'+side)
            expect(transfer).to_be_enabled(timeout=30000)
            mark_old_renders()
            self.page.once('dialog',lambda dialog:dialog.accept())
            transfer.click()
            current,_=verify_compare(side,scene)
            self.assertEqual(current['calibrationOrigin']['resultId'],calibrated_b['calibrationOrigin']['resultId'])
            if side=='A':
                self.page.locator('#ModernPreviousExperiment').click()
                self.assertEqual(checkpoint(before=scene),scene)

        # Restore the mixed B checkpoint through the actual public URL.
        # Same browser has the verified immutable archive; a foreign one
        # receives only the compact association, never a verified fit claim.
        self.page.goto('about:blank')
        self.page.goto(share_url,wait_until='load')
        expect(ready).to_be_enabled(timeout=30000)
        expect(ready_status('B')).to_contain_text('Calibrated · archived fit inputs match',timeout=30000)
        expect(self.page.locator('#ModernModelTabB')).to_have_attribute('aria-pressed','true')
        self.page.reload(wait_until='load')
        expect(ready).to_be_enabled(timeout=30000)
        expect(ready_status('B')).to_contain_text('Calibrated · archived fit inputs match',timeout=30000)
        expect(self.page.locator('#ModernModelTabB')).to_have_attribute('aria-pressed','true')
        # The explicit shared URL still has exactly the same compact origin.
        self.assertEqual(self.page.evaluate("CurvatureModernExperimentState.readUrl(location.search)"),calibrated_b)
        foreign=self.browser.new_context(viewport={'width':1440,'height':900})
        try:
            page=foreign.new_page()
            page.goto(share_url,wait_until='load')
            expect(page.locator('#ModernPhotoCalibrationOpen')).to_be_enabled(timeout=30000)
            expect(page.locator('#ModernCalibrationApplicabilityB')).to_contain_text(
                'Associated · unverified · Archive result missing',timeout=30000)
            expect(page.locator('#ModernCalibrationApplicabilityA')).to_contain_text('No independent fit')
        finally:
            foreign.close()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_soundly_calibration_live_apply_qualification(self):
        # One genuine seven-field UI fit, reused across deterministic
        # failure injections and a successful, durable Apply. The historical
        # observations are real; the PNG is a synthetic storage fixture.
        self.open_modern()
        ready=self.page.locator('#ModernPhotoCalibrationOpen')
        expect(ready).to_be_enabled(timeout=30000)
        self.page.locator('#ModernRender').click()
        expect(self.page.locator('#ModernPersistenceStatus')).to_have_text(
            'Working session saved',timeout=30000)
        outgoing=self.page.evaluate("""async () =>
            (await CurvatureModernSessionAutosave.read(indexedDB)).experiment""")
        self.assertEqual(outgoing['display']['mode'],'scene')

        scene_read="""() => {
            const {model,physics}=CurvatureModernApp.getPhotoCalibrationScene();
            const keys=[...CurvatureModernExperimentState.CAMERA,'CameraEast','CameraNorth',
                'viewcenterHorizon','showModel','rEarth',...CurvatureModernExperimentState.OBJECT];
            return {model:Object.fromEntries(keys.map(k=>[k,model[k]])),physics};
        }"""
        read_scene=lambda: self.page.evaluate(scene_read)
        original_scene=read_scene()
        ready.click()
        workspace=self.page.locator('#ModernPhotoCalibration')
        expect(workspace).to_be_visible()
        self.page.evaluate("CurvatureModernApp.getHistoryStore().list()")
        data=self.soundly_calibration_experiment()
        self.import_calibration_experiment(data)
        workspace.locator('[data-calibration-stage="calibration"]').click()
        read=lambda: self.page.evaluate(
            "CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()")
        fields=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField']
        self.assertEqual(read()['fit']['freeParameters'],fields)
        for field in fields:
            expect(workspace.locator('[data-fit-field="'+field+'"]')).to_be_checked()
        run=workspace.locator('#ModernCalibrationRunFit')
        expect(run).to_be_enabled()
        run.click()
        button=workspace.locator('#ModernCalibrationApplyScene')
        expect(button).to_be_visible(timeout=120000)
        expect(button).to_be_enabled(timeout=120000)
        fitted=read()
        result=fitted['fit']['result']
        self.assertFalse(fitted['fit']['running'])
        self.assertEqual(result['freeParameters'],fields)
        self.assertTrue(result['evaluation']['valid'])
        self.assertEqual(len(result['evaluation']['points']),14)
        self.assertAlmostEqual(result['initialRmsPx'],314.7555157775399,places=5)
        self.assertGreater(result['acceptedSteps'],0)
        self.assertLess(result['evaluation']['rmsPx'],15)
        self.assertEqual(fitted['observations'],data['observations'])
        self.assertEqual([p['id'] for p in result['evaluation']['points']],
                         [r['landmark']['id'] for r in fitted['observations']])
        self.assertEqual([p['observed'] for p in result['evaluation']['points']],
                         [r['pixel'] for r in fitted['observations']])
        expect(workspace.locator('#ModernCalibrationStorage')).to_have_text(
            'Draft saved in this browser.',timeout=30000)

        status=workspace.locator('#ModernCalibrationApplyStatus')
        def apply():
            self.page.once('dialog',lambda prompt:prompt.accept())
            button.click()
        def unchanged():
            expect(workspace).to_be_visible()
            expect(button).to_be_enabled(timeout=30000)
            self.assertEqual(read_scene(),original_scene)
            self.assertEqual(read()['fit']['result'],result)
            self.assertEqual(read()['observations'],fitted['observations'])
            self.assertEqual(read()['referenceImage'],fitted['referenceImage'])
        def stored():
            return self.page.evaluate("""async () => ({
                results:await CurvatureModernCalibrationResultArchive.list(indexedDB),
                history:await CurvatureModernApp.getHistoryStore().list()
            })""")
        def recovery_rows():
            return [row for row in stored()['history'] if row['pinned']]

        # Fail actual IndexedDB writes in only the designated database.
        # All other storage, editor, archive, History and Apply code is real.
        for target,count in [('archive',0),('history',1)]:
            with self.subTest(failure=target):
                self.page.evaluate("""target => {
                    const proto=IDBDatabase.prototype,original=proto.transaction;
                    const name=target==='archive'?CurvatureModernCalibrationResultArchive.DATABASE:
                        CurvatureModernExperimentHistory.DATABASE;
                    window.__qualificationRestoreTransaction=()=>{proto.transaction=original;};
                    proto.transaction=function(stores,mode,...args){
                        if(this.name===name&&mode==='readwrite')
                            throw Error('Qualification '+target+' write rejected');
                        return original.call(this,stores,mode,...args);
                    };
                }""",target)
                try:
                    apply()
                    expect(status).to_contain_text(
                        'Apply failed: Qualification '+target+' write rejected',timeout=30000)
                    unchanged()
                finally:
                    self.page.evaluate("window.__qualificationRestoreTransaction()")
                self.assertEqual(len(stored()['results']),count)
                self.assertEqual(recovery_rows(),[])

        # Hold the real archival acknowledgement at an await boundary.
        # Navigate away and back to the same draft: matching numerical
        # values alone must not authorize the old Apply generation.
        self.page.evaluate("""() => {
            const api=window.CurvatureModernCalibrationResultArchive;
            const gate={ready:false,release:null,restore:()=>{
                window.CurvatureModernCalibrationResultArchive=api;
            }};
            window.__qualificationArchiveGate=gate;
            window.CurvatureModernCalibrationResultArchive={...api,
                async archiveExperiment(...args){
                    const saved=await api.archiveExperiment(...args);
                    await new Promise(resolve=>{gate.release=resolve;gate.ready=true;});
                    return saved;
                }};
        }""")
        try:
            apply()
            self.page.wait_for_function("window.__qualificationArchiveGate.ready",timeout=30000)
            expect(button).to_be_disabled()
            # Busy Apply must not make the whole workspace inert: navigating
            # away is a supported cancellation-by-generation regression.
            self.assertFalse(workspace.evaluate("(node) => node.inert"))
            workspace.locator('#ModernCalibrationClose').click()
            expect(self.page.locator('#ModernSceneTab')).to_have_attribute('aria-pressed','true')
            self.assertEqual(read_scene(),original_scene)
            ready.click()
            expect(workspace).to_be_visible()
            self.page.evaluate("window.__qualificationArchiveGate.release()")
            expect(status).to_contain_text('changed; apply again',timeout=30000)
            unchanged()
        finally:
            self.page.evaluate("""() => {
                const gate=window.__qualificationArchiveGate;
                if(gate.release)gate.release();
                gate.restore();
            }""")
        self.assertEqual(len(stored()['results']),1)
        self.assertEqual(recovery_rows(),[])

        # Retry, using the same genuine fit and already durable original.
        apply()
        expect(self.page.locator('#ModernPresetSwitchStatus')).to_contain_text(
            'Save Snapshot to keep this Scene',timeout=30000)
        expect(self.page.locator('#ModernSceneTab')).to_have_attribute('aria-pressed','true')
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getOpticalQuality()"),'accurate')
        actual=read_scene()
        expect(status).to_contain_text('Applied to Scene. Calibration draft retained.',timeout=30000)
        for field in fields:
            self.assertAlmostEqual(actual['model'][field],result['pose'][field],places=7)
        self.assertEqual(actual['model']['viewcenterHorizon'],3)
        for key in self.page.evaluate("CurvatureModernExperimentState.OBJECT"):
            self.assertEqual(actual['model'][key],fitted['scene']['model'][key])
        for key in ['showModel','rEarth']:
            self.assertEqual(actual['model'][key],fitted['scene']['model'][key])
        self.assertEqual(actual['physics'],fitted['scene']['physics'])
        durable=stored()
        self.assertEqual(len(durable['results']),1)
        rid=durable['results'][0]['id']
        recovery=recovery_rows()
        self.assertEqual(len(recovery),1)
        self.assertEqual(recovery[0]['source'],'recovery')
        self.assertEqual(recovery[0]['experiment'],outgoing)
        self.assertFalse(any((row['experiment'].get('calibrationOrigin') or {}).get('resultId')==rid
                             for row in durable['history']))
        verified=self.page.evaluate("""async id => {
            const archive=CurvatureModernCalibrationResultArchive,
                lib=CurvatureModernReferenceImageLibrary,imp=CurvatureModernReferenceImageImport;
            const record=(await archive.get(indexedDB,id)).record;
            const original=await lib.findOriginal(indexedDB,record.payload.photo,crypto,
                r=>imp.verifyOriginal(r,window));
            if(!original)throw Error('Archived original not found');
            return {record,original:original.record.original};
        }""",rid)
        self.assertEqual(verified['original'],fitted['referenceImage']['original'])
        self.assertEqual(verified['record']['payload']['fit']['result']['pose'],
                         {field:result['pose'][field] for field in fields})
        self.assertEqual(verified['record']['payload']['fit']['result']['evaluation']['rmsPx'],
                         result['evaluation']['rmsPx'])

        # The overlay uses the archived original, not the thumbnail or a
        # second physical render. The regression raster is uniform #eee.
        overlay=self.page.locator('#ModernGraphHost canvas.modern-reference-photo-overlay')
        expect(overlay).to_be_visible(timeout=30000)
        presented=self.page.evaluate("""() => {
            const state=CurvatureModernApp.getPhotoOverlayState();
            const layer=document.querySelector('#ModernGraphHost canvas.modern-reference-photo-overlay');
            const source=[...layer.parentNode.querySelectorAll('canvas')].find(c=>
                c!==layer&&!c.className.includes('modern-atmospheric'));
            return {state,width:layer.width,height:layer.height,
                baseWidth:source.width,baseHeight:source.height,
                pointer:getComputedStyle(layer).pointerEvents,opacity:getComputedStyle(layer).opacity,
                pixel:Array.from(layer.getContext('2d').getImageData(
                    Math.floor(layer.width/2),Math.floor(layer.height/2),1,1).data)};
        }""")
        self.assertEqual(presented['state']['status'],'ready')
        self.assertEqual(presented['state']['resultId'],rid)
        self.assertEqual((presented['width'],presented['height']),
                         (presented['baseWidth'],presented['baseHeight']))
        self.assertEqual(presented['pointer'],'none')
        self.assertEqual(presented['opacity'],'0.5')
        self.assertEqual(presented['pixel'],[238,238,238,255])
        rect=presented['state']['layout']['rect']
        self.assertAlmostEqual(rect['width']/rect['height'],1176/791,places=10)

        # Presentation controls must not redraw or change the physical Scene.
        panel=self.page.locator('#ModernPhotoOverlayControls')
        mode=panel.locator('#ModernPhotoOverlayMode')
        opacity=panel.locator('#ModernPhotoOverlayOpacity')
        expect(panel).to_be_visible()
        expect(mode).to_have_value('overlay')
        expect(panel.locator('#ModernPhotoOverlayStatus')).to_contain_text('Verified original')
        self.page.evaluate("window.__photoControlRender=CurvatureModernApp.getLastRender()")
        opacity.evaluate("(el) => {el.value='23';el.dispatchEvent(new Event('input',{bubbles:true}));}")
        expect(overlay).to_have_css('opacity','0.23')
        expect(panel.locator('#ModernPhotoOverlayOpacityValue')).to_have_text('23%')
        mode.select_option('scene')
        expect(overlay).to_be_hidden()
        expect(opacity).to_be_disabled()
        mode.select_option('photo')
        expect(overlay).to_be_visible()
        expect(overlay).to_have_css('opacity','1')
        expect(overlay).to_have_css('background-color','rgb(255, 255, 255)')
        expect(self.page.locator('#ModernGraphHost')).to_have_attribute('data-photo-display-mode','photo')
        expect(opacity).to_be_disabled()
        mode.select_option('overlay')
        expect(overlay).to_have_css('opacity','0.23')
        expect(overlay).to_have_css('background-color','rgba(0, 0, 0, 0)')
        expect(opacity).to_be_enabled()
        self.assertTrue(self.page.evaluate("window.__photoControlRender===CurvatureModernApp.getLastRender()"))
        self.assertEqual(read_scene(),actual)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().layout.rect"),rect)
        # Leave a nondefault mode active while saving: History is still pure Scene.
        mode.select_option('photo')

        # Capture the independent physical canvas while Photo only covers it.
        # A pure History thumbnail must be byte-identical to this oracle.
        pure_thumbnail=self.page.evaluate("""() => {
            const layer=document.querySelector('#ModernGraphHost canvas.modern-reference-photo-overlay');
            const base=[...layer.parentNode.querySelectorAll('canvas')].find(c=>
                c!==layer&&!c.className.includes('modern-atmospheric'));
            const p=CurvatureModernApp.getAtmosphericPresentation();
            const layers=p&&p.ready('Scene')?[p.getCanvas('Scene'),p.getGuideCanvas('Scene')]:[base];
            return CurvatureModernExperimentThumbnail.capture(document,'scene',[{layers}]);
        }""")
        self.assertIsNotNone(pure_thumbnail)
        # Saving a calibrated Scene remains a separate explicit user action.
        save=self.page.locator('#ModernSnapshotSave')
        expect(save).to_be_visible(timeout=30000)
        save.click()
        expect(self.page.locator('#ModernSnapshotSaveStatus')).to_contain_text(
            'Already in History · protected',timeout=30000)
        manual=[row for row in stored()['history'] if row['source']=='manual']
        self.assertEqual(len(manual),1)
        self.assertTrue(manual[0]['pinned'])
        self.assertEqual(manual[0]['experiment']['calibrationOrigin']['resultId'],rid)
        self.assertEqual(manual[0]['thumbnail'],pure_thumbnail)
        expect(self.page.locator('#ModernPersistenceStatus')).to_have_text(
            'Working session saved',timeout=30000)
        checkpoint=self.page.evaluate("""async () =>
            (await CurvatureModernSessionAutosave.read(indexedDB)).experiment""")
        self.assertEqual(checkpoint,manual[0]['experiment'])
        self.assertEqual(self.page.evaluate("""({checkpoint,record}) =>
            CurvatureModernCalibrationTransfer.applicability(checkpoint,record).views.Scene.status""",
            {'checkpoint':checkpoint,'record':verified['record']}),'calibrated')

        self.page.reload(wait_until='load')
        expect(ready).to_be_enabled(timeout=30000)
        expect(self.page.locator('#ModernPreset')).to_have_value('custom')
        self.assertEqual(read_scene(),actual)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getOpticalQuality()"),'accurate')
        self.assertEqual(len(recovery_rows()),2)
        expect(overlay).to_be_visible(timeout=30000)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().resultId"),rid)
        expect(mode).to_have_value('overlay')
        expect(opacity).to_have_value('50')
        ready.click()
        expect(overlay).to_have_count(0)

        expect(button).to_be_enabled(timeout=30000)
        self.assertEqual(read()['fit']['result'],result)
        self.assertEqual(read()['observations'],fitted['observations'])
        self.assertEqual(read()['referenceImage'],fitted['referenceImage'])
        workspace.locator('#ModernCalibrationClose').click()
        expect(self.page.locator('#ModernSceneTab')).to_have_attribute('aria-pressed','true')
        self.assertEqual(read_scene(),actual)
        expect(overlay).to_be_visible(timeout=30000)
        fixed=self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().layout.rect")

        # Exercise the committed physical path with a bundle of edits, without
        # applying a new calibration or changing the display aspect.
        # A real renderer completion must reuse the existing photo raster.
        self.page.evaluate("""() => {
            const app=CurvatureModernApp,m=app.getModel();
            window.__photoBeforeEdit=app.getLastRender();
            window.__fixedPhotoCanvas=document.querySelector('#ModernGraphHost canvas.modern-reference-photo-overlay');
            m.Pan+=.001;m.Nick+=.001;m.Roll+=.1;m.Height+=1;
            m.CameraEast+=.5;m.CameraNorth+=.5;m.FocalLengthField*=.99;
            m.rEarth*=1.01;m.ObjSize=m.ObjSize.map(x=>x*1.01);
            m.Update();
            document.getElementById('ModernRender').click();
        }""")
        self.page.wait_for_function("CurvatureModernApp.getLastRender() && CurvatureModernApp.getLastRender()!==window.__photoBeforeEdit",timeout=30000)
        self.assertNotEqual(read_scene(),actual)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().layout.rect"),fixed)
        self.assertTrue(self.page.evaluate("window.__fixedPhotoCanvas===document.querySelector('#ModernGraphHost canvas.modern-reference-photo-overlay')"))
        self.page.evaluate("""() => {
            window.__photoBeforeEdit=CurvatureModernApp.getLastRender();
            const e=document.getElementById('ModernAtmosphere');
            e.value=e.value==='vacuum'?'standard':'vacuum';
            e.dispatchEvent(new Event('change',{bubbles:true}));
        }""")
        self.page.wait_for_function("CurvatureModernApp.getLastRender() && CurvatureModernApp.getLastRender()!==window.__photoBeforeEdit",timeout=30000)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().layout.rect"),fixed)

        # The actual pointer route may use Direct or the CSS fallback.
        # Both must leave the registered photo in its original viewport.
        base=self.page.locator('#ModernGraphHost canvas:not(.modern-reference-photo-overlay):not(.modern-atmospheric-image):not(.modern-atmospheric-guides)').first
        base.scroll_into_view_if_needed()
        bounds=base.bounding_box()
        self.assertIsNotNone(bounds)
        x=bounds['x']+bounds['width']*.5
        y=bounds['y']+bounds['height']*.5
        old_pan=self.page.evaluate("CurvatureModernApp.getModel().Pan")
        self.page.mouse.move(x,y)
        self.page.mouse.down()
        try:
            self.page.mouse.move(x+8,y+3,steps=3)
            self.page.evaluate("() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
            self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().layout.rect"),fixed)
            expect(overlay).to_be_visible()
        finally:
            self.page.mouse.up()
        self.page.wait_for_function("p=>CurvatureModernApp.getModel().Pan!==p",arg=old_pan,timeout=30000)
        self.page.wait_for_function("CurvatureModernApp.getPhotoOverlayState().available",timeout=30000)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().layout.rect"),fixed)

        # Preserve the edited experiment (and its historical baseline) in
        # History, leave it for an unrelated preset, then restore via Previous.
        edited=read_scene()
        preset=self.page.locator('#ModernPreset')
        preset.select_option('chicago')
        expect(preset).to_have_value('chicago',timeout=30000)
        expect(panel).to_be_hidden()
        expect(overlay).to_have_count(0)
        previous=self.page.locator('#ModernPreviousExperiment')
        expect(previous).to_be_enabled(timeout=30000)
        previous.click()
        expect(preset).to_have_value('custom',timeout=30000)
        expect(overlay).to_be_visible(timeout=30000)
        self.assertEqual(read_scene(),edited)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().resultId"),rid)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().layout.rect"),fixed)
        backing=self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().backing")
        self.page.set_viewport_size({'width':1100,'height':800})
        self.page.wait_for_function("""before => {
            const s=CurvatureModernApp.getPhotoOverlayState();
            return s.available&&s.backing.width!==before.width;
        }""",arg=backing,timeout=30000)
        resized=self.page.evaluate("CurvatureModernApp.getPhotoOverlayState()")
        self.assertEqual(resized['resultId'],rid)
        self.assertAlmostEqual(resized['layout']['rect']['width']/resized['layout']['rect']['height'],1176/791,places=10)
        self.assertEqual(read_scene(),edited)

        # Simulate external loss of original bytes in this isolated browser
        # context, while retaining the actual archive and physical checkpoint.
        # Do not use the calibration draft or its thumbnail as a fallback.
        ready.click()
        expect(overlay).to_have_count(0)
        self.page.evaluate("""() => new Promise((resolve,reject)=>{
            const lib=CurvatureModernReferenceImageLibrary;
            const request=indexedDB.open(lib.DATABASE,1);
            request.onerror=()=>reject(request.error);
            request.onsuccess=()=>{
                const db=request.result,tx=db.transaction(lib.STORE,'readwrite');
                tx.oncomplete=()=>{db.close();resolve();};
                tx.onabort=()=>{db.close();reject(tx.error);};
                tx.objectStore(lib.STORE).clear();
            };
        })""")
        workspace.locator('#ModernCalibrationClose').click()
        expect(panel).to_be_visible()
        expect(panel.locator('#ModernPhotoOverlayStatus')).to_contain_text(
            'Reference photo original unavailable',timeout=30000)
        expect(mode).to_have_value('scene')
        expect(mode).to_be_disabled()
        expect(opacity).to_be_disabled()
        expect(overlay).to_have_count(0)
        self.assertEqual(read_scene(),edited)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getPhotoOverlayState().resultId"),rid)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_reference_photo_overlay_raster_matrix(self):
        # No named experiment, historical photo or fitted observation coordinates.
        # Real Chromium image decode, IndexedDB archive/library, GraphX3DX
        # viewport, physical Canvas Direct renderer and production photo layer.
        # A synthetic archived candidate establishes identity, not fit accuracy.
        exercise="""async () => {
            const check=(ok,msg)=>{if(!ok)throw Error(msg);};
            const near=(a,b,tol,msg)=>check(Math.abs(a-b)<=tol,msg+': '+a+' vs '+b);
            const app=CurvatureModernApp, archive=CurvatureModernCalibrationResultArchive,
                resultApi=CurvatureModernCalibrationResult, lib=CurvatureModernReferenceImageLibrary,
                imp=CurvatureModernReferenceImageImport, physical=CurvaturePhysicalCamera,
                photoCamera=CurvatureCameraPhysicalPose, renderer=CurvatureMainCanvasRenderer;
            const {model,physics}=app.getPhotoCalibrationScene();
            Object.assign(model,{showModel:1,viewcenterHorizon:3,Height:10,Pan:0,Nick:0,Roll:0,
                CameraEast:0,CameraNorth:0,FocalLengthField:100,NObjects:[1,0]});
            physics.atmosphere='vacuum';
            model.camViewAngle=2*Math.atan(43.2/(2*model.FocalLengthField));
            const pose=Object.fromEntries(['CameraEast','CameraNorth','Height','Pan','Nick','Roll',
                'FocalLengthField'].map(k=>[k,model[k]]));
            const host=document.createElement('div');
            host.style.cssText='position:relative;width:360px;overflow:hidden;background:white';
            document.body.appendChild(host);
            // The legacy graph factory emits its markup through document.writeln.
            // Redirect only this new test graph's synchronous construction;
            // don't replace the real Scene or its renderer.
            let graph;
            const write=document.writeln;
            try{
                document.writeln=(...parts)=>host.insertAdjacentHTML('beforeend',parts.join(''));
                graph=NewGraphX3D({Id:'QualificationPhotoGraph',Width:'100%',Height:'66.67%',
                    BorderWidth:0,AutoReset:true,AutoClear:true,AutoScalePix:true});
            }finally{document.writeln=write;}
            const source=graph.Canvas, presenter=CurvatureModernPhotoOverlayRenderer.create(window);
            const delay=()=>new Promise(r=>requestAnimationFrame(r));
            async function ready(){
                for(let i=0;i<300;i++){
                    const s=presenter.snapshot();
                    if(s.available)return s;
                    if(s.status==='unavailable')throw Error(s.error);
                    await delay();
                }
                throw Error('Reference presentation timed out: '+JSON.stringify(presenter.snapshot()));
            }
            async function clearStore(api){
                await new Promise((resolve,reject)=>{
                    const request=indexedDB.open(api.DATABASE,1);
                    request.onerror=()=>reject(request.error);
                    request.onsuccess=()=>{
                        const db=request.result,tx=db.transaction(api.STORE,'readwrite');
                        tx.oncomplete=()=>{db.close();resolve();};
                        tx.onabort=()=>{db.close();reject(tx.error);};
                        tx.objectStore(api.STORE).clear();
                    };
                });
            }
            async function unavailable(origin,camera,aspect,message){
                presenter.clear();presenter.setMode('photo');
                presenter.capture(origin,source,camera,aspect);
                for(let i=0;i<300&&presenter.snapshot().status!=='unavailable';i++)await delay();
                const s=presenter.snapshot();
                check(s.status==='unavailable'&&s.error.includes(message),'Missing asset status '+JSON.stringify(s));
                check(s.effectiveMode==='scene'&&!s.available&&!host.querySelector('.modern-reference-photo-overlay'),
                    'Missing asset must not cover the physical canvas');
            }
            let cases=0,samples=0,cropped=0,uncovered=0,lastOrigin,lastCamera,lastAspect;
            const aspects=[1.5,2/3,16/9,9/16];
            try{
                for(const [w,h] of [[400,200],[200,400],[250,250],[350,150]]){
                    const raster=document.createElement('canvas');raster.width=w;raster.height=h;
                    const ctx=raster.getContext('2d'),marks=[];
                    for(let j=0;j<5;j++)for(let i=0;i<5;i++){
                        const color=[20+40*i,20+40*j,30+7*(5*j+i),255];
                        ctx.fillStyle='rgb('+color.slice(0,3).join(',')+')';
                        ctx.fillRect(i*w/5,j*h/5,w/5,h/5);
                        marks.push({u:(i+.5)*w/5,v:(j+.5)*h/5,color});
                    }
                    const blob=await new Promise(r=>raster.toBlob(r,'image/png'));
                    const referenceImage=await imp.ingest(new File([blob],'Grid '+w+'x'+h+'.png',
                        {type:'image/png'}),'grid_'+w+'_'+h,window);
                    const landmark={id:'b0:p0:v0',bank:0,objectType:model.ObjType[0],primitive:0,vertex:0};
                    const pixel=[w/2,h/2],row={kind:'vertex',landmark,pixel,weight:1,included:true};
                    const input={format:'curvature-photo-calibration',version:2,scene:{model,physics},
                        referenceImage,referenceSource:null,observations:[row],
                        fit:{method:'canvas-direct',maxIterations:80,freeParameters:[],running:false,status:'fixed',
                            result:{status:'fixed',pose,method:'canvas-direct',atmosphere:'vacuum',
                                initialRmsPx:0,evaluations:1,acceptedSteps:0,freeParameters:[],
                                evaluation:{valid:true,rmsPx:0,weightedRmsPx:0,cost:0,
                                    points:[{id:landmark.id,observed:pixel,predicted:pixel,weight:1,status:'visible'}]}}}};
                    const saved=await archive.archiveExperiment(indexedDB,input,window);
                    const origin=resultApi.origin(saved.row.record,'Scene');
                    presenter.clear();presenter.setMode('overlay');
                    for(const aspect of aspects){
                        // GraphX3DX's backing resize is width-triggered.
                        // A height-only ratio edit at the same width leaves
                        // its old backing height untouched. Exercise real
                        // width changes as well as the new requested aspect.
                        const cssWidth=[360,362,384,288][aspects.indexOf(aspect)];
                        host.style.width=cssWidth+'px';
                        graph.CanvasRatioHW=1/aspect;
                        graph.UpdateCanvasSize();
                        near(source.offsetWidth,cssWidth,1,'Graph CSS width');
                        near(source.offsetHeight,cssWidth/aspect,1,'Graph CSS height');
                        model.deviceRatio=aspect;
                        const render=renderer.renderPhysical(graph,model,{atmosphere:'vacuum',opticalQuality:'canvas-direct',
                            geometryBackend:'canvas',captureProjection:true,captionMode:'off',showCaptions:false});
                        const camera=render.projectionCamera,v=camera.pixelTransform;
                        const base=source.toDataURL();
                        presenter.capture(origin,source,camera,aspect);
                        const s=await ready(),layer=host.querySelector('.modern-reference-photo-overlay');
                        check(layer.width===source.width&&layer.height===source.height,'Backing dimensions');
                        near(v.contextScale,devicePixelRatio,1e-9,'Actual Chromium DPR');
                        near(source.width/source.height,aspect,.02,'Actual graph aspect');
                        // Independent oracle: use the existing two physical
                        // camera intrinsics, not the overlay registration API.
                        const photo=photoCamera.photoCamera(model,w,h);
                        const baseline=physical.create(model);
                        const scale=-v.scaleY*camera.screenSize*photo.sceneSize/(h*baseline.sceneSize);
                        const x=v.offsetX-w*scale/2,y=v.offsetY-h*scale/2;
                        const rr=s.layout.rect;
                        for(const [a,b] of [[rr.x,x],[rr.y,y],[rr.width,w*scale],[rr.height,h*scale]])
                            near(a,b,1e-7,'Independent angular rectangle');
                        near(rr.width/rr.height,w/h,1e-10,'Original aspect preserved');
                        const c=layer.getContext('2d');
                        const read=(x,y)=>Array.from(c.getImageData(x,y,1,1).data);
                        let checked=0;
                        for(const m of marks){
                            const px=Math.floor(x+m.u*scale),py=Math.floor(y+m.v*scale);
                            if(px<2||py<2||px>=layer.width-2||py>=layer.height-2)continue;
                            check(read(px,py).every((n,i)=>n===m.color[i]),
                                'Control marker mismatch '+JSON.stringify({w,h,aspect,px,py,actual:read(px,py),expected:m.color}));
                            checked++;samples++;
                        }
                        check(checked>=5,'Insufficient visible control marks');
                        // Verify transparent uncovered pixels and cropped
                        // rectangles; no stretching the original into clip.
                        for(const px of [2,layer.width-3])for(const py of [2,layer.height-3]){
                            if(px<x-2||px>x+w*scale+2||py<y-2||py>y+h*scale+2){
                                check(read(px,py)[3]===0,'Uncovered pixel must stay transparent');uncovered++;
                            }
                        }
                        if(x< -2||y< -2||x+w*scale>layer.width+2||y+h*scale>layer.height+2)cropped++;
                        presenter.setMode('photo');presenter.setMode('scene');presenter.setMode('overlay');
                        check(source.toDataURL()===base,'Physical pixels changed by overlay');
                        cases++;lastOrigin=origin;lastCamera=camera;lastAspect=aspect;
                    }
                }
                check(cropped>0&&uncovered>0,'Crop and uncovered margins both exercised');
                await clearStore(lib);
                await unavailable(lastOrigin,lastCamera,lastAspect,'original unavailable');
                await clearStore(archive);
                await unavailable(lastOrigin,lastCamera,lastAspect,'result unavailable');
                return {cases,samples,cropped,uncovered,dpr:devicePixelRatio};
            }finally{
                presenter.clear();graph.CancelPendingDraws();
                if(graph.ResizeTimer)clearTimeout(graph.ResizeTimer);
                host.remove();
            }
        }"""
        for dpr in [1,2]:
            with self.subTest(dpr=dpr):
                context=self.browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=dpr)
                try:
                    page=context.new_page()
                    errors=[]
                    page.on('pageerror',lambda exc:errors.append(str(exc)))
                    page.goto(self.base_url,wait_until='load',timeout=30000)
                    expect(page.locator('#ModernSceneTab')).to_be_enabled(timeout=30000)
                    outcome=page.evaluate(exercise)
                    self.assertEqual(outcome['cases'],16)
                    self.assertEqual(outcome['dpr'],dpr)
                    self.assertGreaterEqual(outcome['samples'],80)
                    self.assertGreater(outcome['cropped'],0)
                    self.assertGreater(outcome['uncovered'],0)
                    self.assertEqual(errors,[])
                finally:
                    context.close()

    def test_calibration_legacy_json_import_apply_and_reload(self):
        workspace=self.open_physical_calibration()
        fixture=json.loads((ROOT/'tests/fixtures/soundly-mixed-calibration.json').read_text(encoding='utf-8'))
        # Pre-material formats allowed authored vertices only. Use the genuine
        # legacy subset, never relabel material anchors as legacy vertices.
        rows=[{k:v for k,v in row.items() if k!='included'}
              for row in fixture['observations']
              if row['kind']=='vertex' and 'anchor' not in row['landmark']]
        self.assertGreaterEqual(len(rows),2)
        data=self.soundly_calibration_experiment(rows)
        data['version']=1
        data['fit']['freeParameters']=['Height']
        read=lambda: self.page.evaluate(
            "CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()")
        def import_file(value,title,replace=False):
            value['referenceImage']['title']=title
            if replace:
                self.page.once('dialog',lambda prompt:prompt.accept())
            workspace.locator('#ModernCalibrationExperimentFile').set_input_files({
                'name':'legacy-calibration.json','mimeType':'application/json',
                'buffer':json.dumps(value).encode('utf-8')})
            self.page.wait_for_function("""title => {
                try{return CurvatureModernPhotoCalibrationEditor.mount(document)
                    .exportExperiment().referenceImage.title===title;}
                catch(e){return false;}
            }""",arg=title,timeout=30000)
            expect(workspace.locator('#ModernCalibrationExchangeStatus')).to_have_text(
                'Experiment imported.',timeout=30000)
        import_file(data,'Legacy v1 draft')
        current=read()
        self.assertEqual(current['version'],2)
        self.assertEqual(current['observations'],[{**r,'included':True} for r in rows])
        workspace.locator('[data-calibration-stage="calibration"]').click()
        workspace.locator('#ModernCalibrationRunFit').click()
        button=workspace.locator('#ModernCalibrationApplyScene')
        expect(button).to_be_visible(timeout=90000)
        expect(button).to_be_enabled(timeout=90000)
        fitted=read()
        self.assertTrue(fitted['fit']['result']['evaluation']['valid'])
        self.assertEqual(len(fitted['fit']['result']['evaluation']['points']),len(rows))
        # A stored legacy fit lacks the v3 material binding and role field.
        fitted['version']=1
        fitted['observations']=rows
        self.assertNotIn('materialBinding',fitted['fit']['result'])
        import_file(fitted,'Legacy v1 fitted result',replace=True)
        expect(button).to_be_enabled()
        self.assertEqual(read()['fit']['result'],fitted['fit']['result'])
        self.page.once('dialog',lambda prompt:prompt.accept())
        button.click()
        expect(self.page.locator('#ModernPresetSwitchStatus')).to_contain_text(
            'Save Snapshot to keep this Scene',timeout=30000)
        self.assertAlmostEqual(self.page.evaluate("CurvatureModernApp.getModel().Height"),
                               fitted['fit']['result']['pose']['Height'],places=7)
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(button).to_be_enabled()
        # v2 introduced validation roles. Import that older draft with a
        # deliberately held-out vertex and check it survives a true reload.
        data['version']=2
        data['observations']=[{**row,'included':i!=0} for i,row in enumerate(rows)]
        import_file(data,'Legacy v2 validation draft',replace=True)
        self.assertEqual(read()['observations'],data['observations'])
        self.assertIsNone(read()['fit']['result'])
        expect(button).to_be_disabled()
        expect(workspace.locator('#ModernCalibrationStorage')).to_have_text(
            'Draft saved in this browser.',timeout=30000)
        self.page.reload(wait_until='load')
        expect(workspace).to_be_visible(timeout=30000)
        self.assertEqual(read()['version'],2)
        self.assertEqual(read()['observations'],data['observations'])
        self.assertIsNone(read()['fit']['result'])
        expect(button).to_be_disabled()
        workspace.locator('#ModernCalibrationClose').click()
        self.assertAlmostEqual(self.page.evaluate("CurvatureModernApp.getModel().Height"),
                               fitted['fit']['result']['pose']['Height'],places=7)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)

    def test_photo_calibration_correspondence_editor(self):
        workspace=self.open_physical_calibration()
        scene_before=self.page.evaluate("JSON.stringify([CurvatureModernApp.getModel().Height,CurvatureModernApp.getModel().CameraEast,CurvatureModernApp.getModel().CameraNorth,CurvatureModernApp.getModel().FocalLengthField,CurvatureModernApp.getModel().ObjType,CurvatureModernApp.getModel().NObjects,CurvatureModernApp.getPhotoCalibrationScene().physics])")
        data=self.soundly_calibration_experiment()
        self.import_calibration_experiment(data)
        expect(self.page.locator('#ModernWorkspace')).to_be_hidden()
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('14 correspondences')
        inline=workspace.locator('#ModernCalibrationInlineViewer')
        canvas=inline.locator('canvas')
        expect(inline.locator('h2')).to_have_text('Model · Free View')
        expect(canvas).to_be_visible()
        expect(workspace.locator('#ModernCalibrationMesh')).to_be_hidden()
        for removed in ['ModernCalibrationViewer','ModernCalibrationLegacyToggle','ModernCalibrationPickMode',
                        'ModernCalibrationOpenViewer','ModernCalibrationBank']:
            expect(workspace.locator('#'+removed)).to_have_count(0)
        state=lambda: self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).inlineViewerState()")
        rows=lambda: self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment().observations")
        workflow=lambda: self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).pairWorkflow()")
        before=state()
        self.assertEqual(before['mode'],'free')
        self.assertEqual(before['pickMode'],'auto')
        canvas.hover()
        self.page.mouse.wheel(0,-120)
        self.page.wait_for_function("z=>CurvatureModernPhotoCalibrationEditor.mount(document).inlineViewerState().view.zoom>z",arg=before['view']['zoom'])
        canvas.click(button='right',position={'x':5,'y':5})
        workspace.get_by_role('menuitem',name='Reset model view',exact=True).click()
        picked=self.page.evaluate("""() => {
            const e=CurvatureModernPhotoCalibrationEditor.mount(document),
              c=document.querySelector('#ModernCalibrationInlineViewer canvas'),r=c.getBoundingClientRect();
            const pts=e.inlineViewerCorrespondences().filter(p=>p.pixel&&['visible','wireframe'].includes(p.visibility))
              .map(p=>({...p,x:p.pixel[0]*r.width/c.width,y:p.pixel[1]*r.height/c.height}));
            const point=pts.find(p=>p.x>12&&p.y>12&&p.x<r.width-12&&p.y<r.height-12&&
              pts.every(q=>q.id===p.id||Math.hypot(p.x-q.x,p.y-q.y)>20));
            if(!point)throw Error('No isolated physical correspondence marker');
            return {...point,index:e.exportExperiment().observations.findIndex(row=>row.landmark.id===point.id)};
        }""")
        pairs=workspace.locator('#ModernCalibrationPairList')
        pairs.locator('summary').click()
        workspace.locator('#ModernCalibrationPairs tr').nth(picked['index']).get_by_role('button',name='Delete',exact=True).click()
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('13 correspondences')
        photo=workspace.locator('#ModernCalibrationPhoto')
        px=photo.evaluate("""c=>{
          const r=c.getBoundingClientRect(),v=CurvatureModernPhotoCalibrationEditor.fit(1176,791,c.width,c.height);
          return {x:(v.x+100*v.scale)*r.width/c.width,y:(v.y+80*v.scale)*r.height/c.height};
        }""")
        photo.click(position=px)
        canvas.click(position={'x':picked['x'],'y':picked['y']})
        self.page.wait_for_function("CurvatureModernPhotoCalibrationEditor.mount(document).pairWorkflow().draft?.landmark != null")
        self.assertIsNotNone(workflow()['draft']['pixel'])
        photo.dblclick(position=px)
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('14 correspondences')
        after=rows()
        self.assertIn('anchor',after[-1]['landmark'])
        self.assertAlmostEqual(after[-1]['pixel'][0],100,delta=3)
        self.assertAlmostEqual(after[-1]['pixel'][1],80,delta=3)
        self.page.keyboard.press('Control+z')
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('13 correspondences')
        self.page.keyboard.press('Control+Shift+z')
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('14 correspondences')
        self.assertEqual(rows(),after)
        self.page.locator('#ModernCompareTab').click()
        expect(workspace).to_be_hidden()
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(workspace).to_be_visible()
        self.assertEqual(rows(),after)
        self.open_animation()
        expect(workspace).to_be_hidden()
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(workspace).to_be_visible()
        self.assertEqual(rows(),after)
        workspace.locator('#ModernCalibrationClose').click()
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getWorkspaceMode()"),'scene')
        self.assertEqual(self.page.evaluate("JSON.stringify([CurvatureModernApp.getModel().Height,CurvatureModernApp.getModel().CameraEast,CurvatureModernApp.getModel().CameraNorth,CurvatureModernApp.getModel().FocalLengthField,CurvatureModernApp.getModel().ObjType,CurvatureModernApp.getModel().NObjects,CurvatureModernApp.getPhotoCalibrationScene().physics])"),scene_before)

    def test_photo_calibration_full_scene_picking(self):
        workspace=self.open_physical_calibration()
        data=self.soundly_calibration_experiment()
        self.import_calibration_experiment(data)
        stage=lambda name: workspace.locator('[data-calibration-stage="'+name+'"]')
        workflow=lambda: self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).pairWorkflow()")
        inline=workspace.locator('#ModernCalibrationInlineViewer')
        expect(inline).to_be_visible()
        expect(workspace.locator('#ModernCalibrationManualPairs')).not_to_have_attribute('open','')
        expect(workspace.locator('#ModernCalibrationPairList')).not_to_have_attribute('open','')
        expect(workspace.locator('#ModernCalibrationViewTools')).not_to_have_attribute('open','')
        manual=workspace.locator('#ModernCalibrationManualPairs')
        manual.locator('summary').click()
        workspace.locator('#ModernCalibrationBeginPair').click()
        workspace.locator('#ModernCalibrationX').fill('120')
        workspace.locator('#ModernCalibrationY').fill('130')
        draft=workflow()
        stage('calibration').click()
        expect(inline).to_be_hidden()
        expect(workspace.locator('#ModernCalibrationPairList')).to_have_attribute('open','')
        stage('result').click()
        expect(workspace.locator('#ModernCalibrationOpticalTitle')).to_have_text('Model · Initial Camera')
        stage('correspondences').click()
        self.assertEqual(workflow(),draft)
        manual.locator('summary').click()
        workspace.locator('#ModernCalibrationCancelEdit').click()
        # Actual worker regression with the unchanged fourteen measured points.
        stage('calibration').click()
        workspace.locator('#ModernCalibrationRunFit').click()
        expect(workspace.locator('#ModernCalibrationBestView')).to_be_enabled(timeout=60000)
        expect(workspace.locator('#ModernCalibrationStopFit')).to_be_disabled(timeout=60000)
        fit=self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).fitResult()")
        self.assertTrue(fit['evaluation']['valid'])
        self.assertEqual(len(fit['evaluation']['points']),14)
        self.assertAlmostEqual(fit['initialRmsPx'],314.7555157775399,delta=.01)
        self.assertLess(fit['evaluation']['rmsPx'],10)
        expect(stage('result')).to_have_attribute('aria-current','step')
        expect(inline).to_be_hidden()
        expect(workspace.locator('#ModernCalibrationOpticalTitle')).to_have_text('Model · Best Camera')
        workspace.locator('#ModernCalibrationBestView').click()
        expect(workspace.locator('#ModernCalibrationOpticalTitle')).to_have_text('Model · Initial Camera')
        workspace.locator('#ModernCalibrationBestView').click()
        expect(workspace.locator('#ModernCalibrationOpticalTitle')).to_have_text('Model · Best Camera')
        residuals=workspace.locator('#ModernCalibrationResidualDetails')
        residuals.locator('summary').click()
        expect(workspace.locator('#ModernCalibrationResidualRows tr')).to_have_count(14)
        workspace.locator('#ModernCalibrationResidualRows tr').first.get_by_role('button',name='Select correspondence 1').click()
        expect(workspace.locator('#ModernCalibrationResidualRows tr').first.get_by_role('button',name='Select correspondence 1')).to_have_attribute('aria-pressed','true')
        with self.page.expect_download() as info:
            workspace.locator('#ModernCalibrationExportExperiment').click()
        with open(info.value.path(),encoding='utf-8') as stream:
            exported=json.load(stream)
        self.assertEqual(exported['observations'],data['observations'])
        self.assertEqual(exported['fit']['result'],fit)
        self.assertEqual(exported['referenceImage']['original']['width'],1176)
        self.import_calibration_experiment(exported,replace=True)
        expect(stage('result')).to_have_attribute('aria-current','step')
        self.assertEqual(self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).fitResult()"),fit)
        error=self.page.evaluate("""async data=>{
            const e=CurvatureModernPhotoCalibrationEditor.mount(document);
            data.scene.model.showModel=2;
            try{await e.importExperiment(data);return 'unexpected success';}catch(err){return err.message;}
        }""",exported)
        self.assertIn('Flat calibration experiments are no longer supported',error)
        self.assertEqual(self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment().observations"),data['observations'])
        expect(workspace.locator('#ModernCalibrationStorage')).to_have_text('Draft saved in this browser.')
        self.page.reload(wait_until='load')
        expect(workspace).to_be_visible()
        expect(stage('result')).to_have_attribute('aria-current','step')
        self.assertEqual(self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).fitResult()"),fit)

    def test_all_workspace_tabs_restore_through_same_preference(self):
        self.open_modern()
        tabs={'scene':'ModernSceneTab','compare':'ModernCompareTab',
              'animation':'ModernAnimationTab','calibration':'ModernPhotoCalibrationOpen',
              'demos':'ModernDemosTab'}
        # The calibration tab is enabled only after asynchronous Scene/session
        # and draft restoration, not merely after the document load event.
        ready=self.page.locator('#ModernPhotoCalibrationOpen')
        expect(ready).to_be_enabled(timeout=30000)
        for mode in ['compare','animation','calibration','demos','scene']:
            with self.subTest(mode=mode):
                self.page.locator('#'+tabs[mode]).click()
                self.page.wait_for_function("m => CurvatureModernApp.getWorkspaceMode() === m",arg=mode)
                self.assertEqual(self.page.evaluate("""() => JSON.parse(localStorage.getItem(
                    CurvatureModernApplicationPreferences.STORAGE_KEY)).workspace.mode"""),mode)
                # Keep immediate reload: do not wait for a debounced save.
                self.page.reload(wait_until='load')
                expect(ready).to_be_enabled(timeout=30000)
                self.page.wait_for_function("m => CurvatureModernApp.getWorkspaceMode() === m",arg=mode)
                self.assertEqual(self.page.evaluate("""() => JSON.parse(localStorage.getItem(
                    CurvatureModernApplicationPreferences.STORAGE_KEY)).workspace.mode"""),mode)
                for key,tab in tabs.items():
                    expect(self.page.locator('#'+tab)).to_have_attribute(
                        'aria-pressed','true' if key==mode else 'false')
                expect(self.page.locator('#ModernPhotoCalibration')).to_be_visible() if mode=='calibration' else expect(self.page.locator('#ModernPhotoCalibration')).to_be_hidden()
                expect(self.page.locator('#ModernAnimationWorkspace')).to_be_visible() if mode=='animation' else expect(self.page.locator('#ModernAnimationWorkspace')).to_be_hidden()

    def test_generated_experiment_url_reload_without_history_state(self):
        self.open_modern()
        ready=self.page.locator('#ModernPhotoCalibrationOpen')
        expect(ready).to_be_enabled(timeout=30000)
        self.page.locator('#ModernCompareTab').click()
        self.page.wait_for_function("""() =>
            history.state?.__curvatureModernAutoExperimentUrlV1===true &&
            CurvatureModernExperimentState.isWorkingExperimentUrl(location.href,localStorage)""",timeout=30000)
        url=self.page.url
        shared_url=self.page.evaluate("""() => {
            const codec=CurvatureModernExperimentState;
            return codec.urlWithExperiment(location.href,codec.readUrl(location.search));
        }""")
        self.assertNotEqual(url,shared_url)
        self.assertEqual(self.page.evaluate("""url => {
            const codec=CurvatureModernExperimentState;
            return codec.readUrl(new URL(url).search).display.mode;
        }""",shared_url),'compare')
        self.page.locator('#ModernSceneTab').click()
        self.page.wait_for_function("CurvatureModernApp.getWorkspaceMode()==='scene'")
        self.assertEqual(self.page.url,url)
        # Reproduce the CI artifact, including loss of the previous .5a
        # fallback. The local URL contract must not depend on either state
        # object, sessionStorage, or PerformanceNavigationTiming.
        self.page.evaluate("""() => {
            history.replaceState(null,'',location.href);
            sessionStorage.clear();
        }""")
        self.page.reload(wait_until='load')
        expect(ready).to_be_enabled(timeout=30000)
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getWorkspaceMode()"),'scene')
        expect(self.page.locator('#ModernPersistenceStatus')).not_to_have_text('Restored shared URL')

        # The public copy of the SAME payload is still an explicit shared
        # link even when the browser retains an unrelated local session.
        self.page.goto('about:blank')
        self.page.goto(shared_url,wait_until='load')
        expect(ready).to_be_enabled(timeout=30000)
        expect(self.page.locator('#ModernPersistenceStatus')).to_have_text('Restored shared URL')
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getWorkspaceMode()"),'compare')
        self.page.reload(wait_until='load')
        expect(ready).to_be_enabled(timeout=30000)
        expect(self.page.locator('#ModernPersistenceStatus')).to_have_text('Restored shared URL')
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getWorkspaceMode()"),'compare')

        # Even a marked address remains portable to another browser: its
        # flag alone cannot authorize restoration of local working state.
        foreign=self.browser.new_context(viewport={'width':1440,'height':900})
        try:
            page=foreign.new_page()
            page.goto(url,wait_until='load')
            expect(page.locator('#ModernPhotoCalibrationOpen')).to_be_enabled(timeout=30000)
            expect(page.locator('#ModernPersistenceStatus')).to_have_text('Restored shared URL')
            self.assertEqual(page.evaluate("CurvatureModernApp.getWorkspaceMode()"),'compare')
        finally:
            foreign.close()

    def test_explicit_workspace_link_then_user_choice_survives_reload(self):
        self.open_modern()
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        self.page.goto(self.base_url+'?mode=compare',wait_until='load')
        self.page.wait_for_function("CurvatureModernApp.getWorkspaceMode() === 'compare'")
        self.page.locator('#ModernAnimationTab').click()
        self.page.reload(wait_until='load')
        self.page.wait_for_function("CurvatureModernApp.getWorkspaceMode() === 'animation'")
        expect(self.page.locator('#ModernAnimationTab')).to_have_attribute('aria-pressed','true')

    def test_photo_calibration_reload_restores_draft(self):
        workspace=self.open_physical_calibration()
        fixture=json.loads((ROOT/'tests/fixtures/soundly-mixed-calibration.json').read_text(encoding='utf-8'))
        data=self.soundly_calibration_experiment(fixture['observations'][:1])
        self.import_calibration_experiment(data)
        canvas=workspace.locator('#ModernCalibrationInlineViewer canvas')
        canvas.hover()
        self.page.mouse.wheel(0,-150)
        manual=workspace.locator('#ModernCalibrationManualPairs')
        manual.locator('summary').click()
        workspace.locator('#ModernCalibrationBeginPair').click()
        workspace.locator('#ModernCalibrationX').fill('25')
        workspace.locator('#ModernCalibrationY').fill('35')
        saved=self.page.evaluate("""() => {
            const e=CurvatureModernPhotoCalibrationEditor.mount(document);
            return {observations:e.exportExperiment().observations,workflow:e.pairWorkflow(),view:e.inlineViewerState().view};
        }""")
        expect(workspace.locator('#ModernCalibrationStorage')).to_have_text('Draft saved in this browser.')
        self.page.reload(wait_until='load')
        expect(workspace).to_be_visible()
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        expect(workspace.locator('#ModernCalibrationPhotoInfo')).to_contain_text('1176 × 791')
        self.page.wait_for_function("CurvatureModernPhotoCalibrationEditor.mount(document).inlineViewerState()?.mode==='free'")
        restored=self.page.evaluate("""() => {
            const e=CurvatureModernPhotoCalibrationEditor.mount(document);
            return {observations:e.exportExperiment().observations,workflow:e.pairWorkflow(),view:e.inlineViewerState().view};
        }""")
        self.assertEqual(restored['observations'],saved['observations'])
        self.assertEqual(restored['workflow'],saved['workflow'])
        self.assertAlmostEqual(restored['view']['zoom'],saved['view']['zoom'])

    def test_photo_calibration_existing_originals(self):
        self.open_modern()
        self.page.wait_for_function("window.CurvatureModernApp?.getWorkspaceMode() === 'scene'")
        original = self.page.evaluate("""async () => {
            const c=document.createElement('canvas');c.width=100;c.height=80;
            c.getContext('2d').fillRect(0,0,100,80);
            const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
            const record=await CurvatureModernReferenceImageImport.ingest(
                new File([blob],'Library photo.png',{type:'image/png'}),'calibration-existing',window);
            await CurvatureModernReferenceImageLibrary.create(indexedDB,record);
            const catalog=window.CurvatureModernDemoCatalog;
            const shipped=catalog.load();
            const embedded=await CurvatureModernReferenceImageImport.ingest(
                new File([blob],'Embedded observation.png',{type:'image/png'}),'calibration-existing',window);
            const demo={id:'test-embedded',project:{name:'Test embedded project',keyframes:[
                {name:'Test frame',referenceImageIds:[embedded.id]}]},referenceImages:[embedded]};
            // Production catalog entries need not contain reference originals.
            // Test the read-only embedded source with an explicit original.
            window.CurvatureModernDemoCatalog={...catalog,load:()=>[...shipped,demo]};
            return {key:JSON.stringify(['demo',demo.id,embedded.id]),
                    title:embedded.title,width:embedded.original.width,height:embedded.original.height};
        }""")
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        dialog=self.page.locator('#ModernPhotoCalibration')
        picker=dialog.locator('#ModernCalibrationSource')
        local_key=json.dumps(['library','calibration-existing'],separators=(',',':'))
        expect(picker.locator('option',has_text='Library photo.png')).to_have_count(1)
        picker.select_option(value=local_key)
        dialog.locator('#ModernCalibrationUsePhoto').click()
        expect(dialog.locator('#ModernCalibrationPhotoInfo')).to_contain_text('100 × 80')
        dialog.locator('#ModernCalibrationReferenceTools summary').click()
        dialog.locator('#ModernCalibrationUsePhoto').click()
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('0 correspondences')
        fixture=json.loads((ROOT/'tests/fixtures/soundly-mixed-calibration.json').read_text(encoding='utf-8'))
        observation={**fixture['observations'][0],'pixel':[25,35]}
        reference=self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment().referenceImage")
        data=self.soundly_calibration_experiment([observation],reference)
        self.import_calibration_experiment(data,replace=True)
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        dialog.locator('#ModernCalibrationReferenceTools summary').click()
        picker.select_option(value=original['key'])
        self.page.once('dialog',lambda prompt: prompt.dismiss())
        dialog.locator('#ModernCalibrationUsePhoto').click()
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        self.page.once('dialog',lambda prompt: prompt.accept())
        dialog.locator('#ModernCalibrationUsePhoto').click()
        expect(dialog.locator('#ModernCalibrationPhotoInfo')).to_contain_text(original['title'])
        expect(dialog.locator('#ModernCalibrationPhotoInfo')).to_contain_text(
            f"{original['width']} × {original['height']}")
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('0 correspondences')
        self.assertEqual(self.page.evaluate("""async () =>
            (await CurvatureModernReferenceImageLibrary.list(indexedDB)).map(r=>r.id)"""),
            ['calibration-existing'])
        dialog.locator('#ModernCalibrationClose').click()

    def test_reference_photo_content_identity(self):
        self.page.goto(self.base_url)
        self.page.wait_for_function('!!window.CurvatureModernReferenceImageImport')
        result = self.page.evaluate("""async () => {
            const lib=CurvatureModernReferenceImageLibrary, imp=CurvatureModernReferenceImageImport;
            const canvas=document.createElement('canvas'); canvas.width=3; canvas.height=2;
            const ctx=canvas.getContext('2d'); ctx.fillStyle='#ecaf41'; ctx.fillRect(0,0,3,2);
            const record={version:1,id:'identity_original',title:'Original',
                original:{dataUrl:canvas.toDataURL('image/png'),width:3,height:2}};
            const verify=r=>imp.verifyOriginal(r,window);
            const original=await imp.identify(record,window);
            // Real decoder and real concurrent IDB read/write transactions.
            const saved=await Promise.all([
                lib.ensureOriginal(indexedDB,record,crypto,verify),
                lib.ensureOriginal(indexedDB,{...record,id:'identity_alias',title:'Alias'},crypto,verify)
            ]);
            const resolved=await lib.findOriginal(indexedDB,original,crypto,verify);
            let invalid=false;
            try { await imp.identify({...record,original:{...record.original,width:2}},window); }
            catch(e) { invalid=true; }
            return {same:saved[0].row.id===saved[1].row.id, identity:original,
                resolved:resolved.id===saved[0].row.id, count:(await lib.list(indexedDB)).length,
                newCount:saved.filter(x=>!x.reused).length, invalid};
        }""")
        self.assertTrue(result['same'])
        self.assertTrue(result['resolved'])
        self.assertTrue(result['invalid'])
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['newCount'], 1)
        self.assertEqual((result['identity']['width'], result['identity']['height']), (3, 2))
        self.assertRegex(result['identity']['sha256'], r'^[0-9a-f]{64}$')

    def test_soundly_calibration_foundation_end_to_end(self):
        self.open_modern()
        fixture = json.loads((ROOT/'tests/fixtures/soundly-mixed-calibration.json').read_text(encoding='utf-8'))
        demo = json.loads((ROOT/'demos/modern/soundly.json').read_text(encoding='utf-8'))['animations'][0]['project']
        # Real worker, all 14 historical observed coordinates, actual numerical
        # optimization. The fixture intentionally omits the original photograph.
        # Synthetic PNG qualifies the storage/decode contract, NOT the photo's
        # evidential identity or the real observation's archival provenance.
        prepared = self.page.evaluate("""async ({fixture,demo}) => {
            const check=(condition,message)=>{if(!condition)throw Error(message);};
            const editor=CurvatureModernPhotoCalibrationEditor, archive=CurvatureModernCalibrationResultArchive,
                transfer=CurvatureModernCalibrationTransfer, codec=CurvatureModernExperimentState,
                library=CurvatureModernReferenceImageLibrary, importer=CurvatureModernReferenceImageImport,
                historyApi=CurvatureModernExperimentHistory, animation=CurvatureModernAnimationProject;
            const model=fixture.model, observations=fixture.observations;
            const options={...fixture.options,maxIterations:80};
            const physics={atmosphere:options.atmosphere,temperatureProfile:options.temperatureProfile};
            const result=await new Promise((resolve,reject)=>{
                const worker=new Worker('src/calibration/CameraCalibrationWorker.js');
                const timeout=setTimeout(()=>{worker.terminate();reject(Error('Soundly worker timed out'));},120000);
                const finish=(fn,value)=>{clearTimeout(timeout);worker.terminate();fn(value);};
                worker.onerror=e=>finish(reject,Error(e.message));
                worker.onmessage=e=>{
                    if(e.data.type==='complete')finish(resolve,e.data.result);
                    if(e.data.type==='error')finish(reject,Error(e.data.message));
                };
                worker.postMessage({model,input:editor.fitRows(observations),options});
            });
            check(result.evaluation.valid,'Invalid Soundly fit');
            check(result.evaluation.points.length===14,'Expected all 14 Fit rows');
            check(Math.abs(result.initialRmsPx-314.7555157775399)<1e-5,'Initial RMS regression');
            check(result.evaluation.rmsPx<15&&result.acceptedSteps>0,'Soundly fit did not improve');
            result.materialBinding=editor.fitBinding(observations,options.freeParameters,model,physics,1176,791);
            const canvas=document.createElement('canvas');canvas.width=1176;canvas.height=791;
            const ctx=canvas.getContext('2d');ctx.fillStyle='#ecaf41';ctx.fillRect(0,0,1176,791);
            const referenceImage={version:1,id:'qualification_raster',title:'Synthetic qualification raster',
                original:{dataUrl:canvas.toDataURL('image/png'),width:1176,height:791}};
            const data={format:'curvature-photo-calibration',version:3,scene:{model,physics},observations,
                referenceImage,referenceSource:null,fit:{method:'canvas-direct',maxIterations:80,
                    freeParameters:options.freeParameters,result,running:false}};
            const saved=await archive.archiveExperiment(indexedDB,data,window);
            const record=saved.row.record;
            const repeated=await archive.archiveExperiment(indexedDB,{...data,
                referenceImage:{...referenceImage,id:'qualification_alias',title:'Alias'}},window);
            check(repeated.reused&&repeated.photoReused&&repeated.row.id===record.id,'Duplicate archival');
            const original=await library.findOriginal(indexedDB,record.payload.photo,crypto,r=>importer.verifyOriginal(r,window));
            check(original.id===saved.photoId,'Original identity resolution failed');
            const current=codec.validate(demo.baseExperiment), history=historyApi.create({indexedDB});
            const items=[];
            for(const target of ['Scene','A','B']){
                const e=transfer.transfer(record,current,target), a=transfer.applicability(e,record);
                check(a.views[target].status==='calibrated','Transfer status '+target);
                for(const key of options.freeParameters)check(e.scene.camera[key]===result.pose[key],'Pose '+key);
                check(e.scene.camera.viewcenterHorizon===3,'Eye-Lvl');
                check(a.historicalFit.rmsPx===result.evaluation.rmsPx,'Historical RMS changed');
                check(a.liveRmsPx===undefined,'Historical RMS presented as live');
                check(JSON.stringify(codec.decode(codec.encode(e)))===JSON.stringify(e),'URL codec '+target);
                const changed=structuredClone(e);changed.scene.camera.Height+=1;
                check(transfer.applicability(changed,record).views[target].status==='derived','Derived '+target);
                changed.scene.camera.Height=e.scene.camera.Height;
                changed.scene.camera.deviceRatio=9/16;
                check(transfer.applicability(changed,record).views[target].status==='calibrated','Display-only '+target);
                if(target!=='Scene'){
                    const other=target==='A'?'B':'A';
                    check(a.views[other].status==='derived','Alternative side certified');
                    for(const k of ['surface','radiusKm','atmosphere','occlusionRadius'])
                        check(e.compare[other][k]===current.compare[other][k],'Alternative physics '+k);
                }
                const entry=(await history.record(e,'manual')).entry;
                check(entry.pinned,'Protected history entry');
                items.push({id:entry.id,target,experiment:e});
            }
            const rows=await Promise.all(items.map(x=>history.get(x.id)));
            const portable=historyApi.exportPortable(rows), imported=historyApi.parsePortable(portable);
            check(!portable.includes('data:image/'),'Image bytes leaked into History');
            const again=await history.importEntries(imported);
            check(again.created===0&&again.reused===3,'Portable History deduplication');
            const base=items[0].experiment, derived=structuredClone(base);derived.scene.camera.Height+=1;
            const p=animation.create([base,derived],{id:'qualification',mode:'camera'});
            const frame=animation.frameExperiment(p,1);
            check(transfer.applicability(frame,record).views.Scene.status==='derived','Studio frame provenance');
            check(JSON.stringify(frame.calibrationOrigin)===JSON.stringify(base.calibrationOrigin),'Studio lost origin');
            check((await archive.list(indexedDB)).length===1,'Duplicate result');
            check((await library.list(indexedDB)).length===1,'Duplicate image');
            return {id:record.id,photoId:saved.photoId,items:items.map(({id,target})=>({id,target})),
                link:codec.urlWithExperiment(location.href,items[0].experiment),
                initial:result.initialRmsPx,rms:result.evaluation.rmsPx,status:result.status,
                pose:result.pose};
        }""", {'fixture': fixture, 'demo': demo})
        self.assertLess(prepared['rms'], 15)
        self.assertAlmostEqual(prepared['initial'], 314.7555157775399, places=5)
        self.page.goto(prepared['link'], wait_until='load')
        expect(self.page.locator('#ModernPreset')).to_have_value('custom', timeout=30000)
        # wait_for_function polls synchronous predicates; an async predicate
        # can return a truthy Promise before its IDB read has completed.
        # Wait for the application's durable completion acknowledgement, then
        # directly await/read the checkpoint and assert its contents.
        status = self.page.locator('#ModernPersistenceStatus')
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        expect(status).to_have_text('Working session saved', timeout=30000)
        compare_saved = self.page.evaluate("""async () => {
            return await CurvatureModernSessionAutosave.read(indexedDB);
        }""")
        self.assertIsNotNone(compare_saved)
        self.assertEqual(compare_saved['experiment']['display']['mode'], 'compare')
        self.assertEqual(compare_saved['experiment']['calibrationOrigin']['resultId'], prepared['id'])
        self.page.locator('#ModernSceneTab').click()
        expect(self.page.locator('#ModernSceneTab')).to_have_attribute('aria-pressed', 'true')
        # Poll the resolved value in Python, not a JavaScript Promise. Require
        # a newer durable Scene checkpoint, not the earlier Compare checkpoint.
        import time
        deadline = time.monotonic() + 30
        checkpoint = None
        while time.monotonic() < deadline:
            checkpoint = self.page.evaluate("""async () => {
                return await CurvatureModernSessionAutosave.read(indexedDB);
            }""")
            if (checkpoint and checkpoint['savedAt'] > compare_saved['savedAt']
                    and checkpoint['experiment']['display']['mode'] == 'scene'):
                break
            self.page.wait_for_timeout(100)
        self.assertIsNotNone(checkpoint, 'No durable Scene checkpoint')
        self.assertGreater(checkpoint['savedAt'], compare_saved['savedAt'])
        self.assertEqual(checkpoint['experiment']['display']['mode'], 'scene')
        self.assertEqual(checkpoint['experiment']['calibrationOrigin']['resultId'], prepared['id'])
        # Remove the URL fallback and synchronous local checkpoint so startup
        # must restore the durable IndexedDB record. A subsequent true reload
        # also verifies the ordinary working-session path.
        self.page.evaluate("""() => {
            localStorage.removeItem(CurvatureModernExperimentState.STORAGE_KEY);
            localStorage.removeItem(CurvatureModernSessionAutosave.META_KEY);
        }""")
        self.page.goto(self.base_url, wait_until='load')
        expect(self.page.locator('#ModernPreset')).to_have_value('custom', timeout=30000)
        self.page.reload(wait_until='load')
        expect(self.page.locator('#ModernPreset')).to_have_value('custom', timeout=30000)
        restored = self.page.evaluate("""async prepared => {
            const archive=CurvatureModernCalibrationResultArchive, transfer=CurvatureModernCalibrationTransfer,
                codec=CurvatureModernExperimentState, library=CurvatureModernReferenceImageLibrary,
                importer=CurvatureModernReferenceImageImport, session=CurvatureModernSessionAutosave;
            const check=(condition,message)=>{if(!condition)throw Error(message);};
            const record=(await archive.get(indexedDB,prepared.id)).record;
            const current=session.normalize(await session.read(indexedDB),codec.validate).experiment;
            check(transfer.applicability(current,record).views.Scene.status==='calibrated','Restored session not calibrated');
            const m=CurvatureModernApp.getModel();
            for(const k of Object.keys(record.payload.fit.result.pose))
                check(Math.abs(m[k]-prepared.pose[k])<1e-7,'Live restored camera '+k);
            const h=CurvatureModernExperimentHistory.create({indexedDB});
            for(const item of prepared.items){
                const row=await h.get(item.id);
                check(transfer.applicability(row.experiment,record).views[item.target].status==='calibrated','Restored history '+item.target);
            }
            check(transfer.applicability(current,null).resultStatus==='missing','Missing result distinction');
            // Simulate independent loss of original storage, not an exposed
            // delete feature. Isolated browser context is discarded after test.
            await new Promise((resolve,reject)=>{
                const req=indexedDB.open(library.DATABASE,1);
                req.onerror=()=>reject(req.error);
                req.onsuccess=()=>{
                    const db=req.result,tx=db.transaction(library.STORE,'readwrite');
                    tx.oncomplete=()=>{db.close();resolve();};
                    tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};
                    tx.objectStore(library.STORE).delete(prepared.photoId);
                };
            });
            const missing=await library.findOriginal(indexedDB,record.payload.photo,crypto,r=>importer.verifyOriginal(r,window));
            check(missing===null,'Missing photograph replaced');
            let rejected=false;try{await archive.save(indexedDB,record,window);}catch(e){rejected=/original photo is unavailable/.test(e.message);}
            check(rejected,'Missing original save accepted');
            check(transfer.applicability(current,(await archive.get(indexedDB,prepared.id)).record).views.Scene.status==='calibrated',
                'Historical applicability confused with asset availability');
            return {rms:record.payload.fit.result.evaluation.rmsPx,
                historicalStatus:record.payload.fit.result.status,photoMissing:missing===null};
        }""", prepared)
        self.assertEqual(restored['rms'], prepared['rms'])
        self.assertEqual(restored['historicalStatus'], prepared['status'])
        self.assertTrue(restored['photoMissing'])
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_calibration_result_archive_roundtrip(self):
        self.page.goto(self.base_url)
        self.page.wait_for_function('!!window.CurvatureModernCalibrationResultArchive')
        fixture = json.loads((ROOT/'tests/fixtures/soundly-mixed-calibration.json').read_text(encoding='utf-8'))
        result = self.page.evaluate("""async fixture => {
            const storage=CurvatureModernCalibrationResultArchive, editor=CurvatureModernPhotoCalibrationEditor;
            const canvas=document.createElement('canvas'); canvas.width=1176; canvas.height=791;
            const ctx=canvas.getContext('2d');ctx.fillStyle='#ecaf41';ctx.fillRect(0,0,1176,791);
            const image={version:1,id:'archive_original',title:'Synthetic archive fixture',
                original:{dataUrl:canvas.toDataURL('image/png'),width:1176,height:791}};
            const model=fixture.model,physics={atmosphere:'vacuum',temperatureProfile:fixture.options.temperatureProfile};
            const observations=fixture.observations.slice(0,1),freeParameters=fixture.options.freeParameters;
            const row=observations[0],points=[{id:row.landmark.id,status:'visible',observed:row.pixel,
                predicted:[row.pixel[0]+3,row.pixel[1]+4],weight:row.weight}];
            const fit={status:'stalled',pose:{...model,Height:42.8},initialRmsPx:10,evaluations:2,
                acceptedSteps:1,method:'canvas-direct',atmosphere:'vacuum',freeParameters,
                evaluation:{valid:true,rmsPx:5,weightedRmsPx:5,cost:25*row.weight/2,points},
                materialBinding:editor.fitBinding(observations,freeParameters,model,physics,1176,791)};
            const data={format:'curvature-photo-calibration',version:3,scene:{model,physics},
                referenceImage:image,referenceSource:null,observations,
                fit:{method:'canvas-direct',maxIterations:80,freeParameters,result:fit,running:false}};
            const saved=await Promise.all([
                storage.archiveExperiment(indexedDB,data,window,{projectId:'first'}),
                storage.archiveExperiment(indexedDB,{...data,referenceImage:{...image,id:'archive_alias',
                    title:'Alias'}},window,{projectId:'second'})
            ]);
            const list=await storage.list(indexedDB);
            return {id:saved[0].row.id,photoId:saved[0].photoId,
                same:saved[0].row.id===saved[1].row.id&&saved[0].photoId===saved[1].photoId,
                newCount:saved.filter(x=>!x.reused).length,photoCount:(await CurvatureModernReferenceImageLibrary.list(indexedDB)).length,
                total:list.length,projectId:saved[0].row.record.provenance.projectId,
                sameProvenance:saved[0].row.record.provenance.projectId===saved[1].row.record.provenance.projectId};
        }""", fixture)
        self.assertTrue(result['same'])
        self.assertTrue(result['sameProvenance'])
        self.assertEqual(result['newCount'], 1)
        self.assertEqual(result['photoCount'], 1)
        self.assertEqual(result['total'], 1)
        self.page.reload(wait_until='load')
        self.page.wait_for_function('!!window.CurvatureModernCalibrationResultArchive')
        restored = self.page.evaluate("""async ids => {
            const storage=CurvatureModernCalibrationResultArchive;
            const row=await storage.get(indexedDB,ids.id);
            const asset=await CurvatureModernReferenceImageLibrary.get(indexedDB,ids.photoId);
            const identity=await CurvatureModernReferenceImageImport.identify(asset.record,window);
            return {id:row.id,projectId:row.record.provenance.projectId,
                samePhoto:identity.sha256===row.record.payload.photo.sha256,
                hasBytes:JSON.stringify(row).includes('data:image/'),
                frozen:Object.isFrozen(row.record.payload.observations),
                total:(await storage.list(indexedDB)).length};
        }""", result)
        self.assertEqual(restored['id'], result['id'])
        self.assertEqual(restored['projectId'], result['projectId'])
        self.assertTrue(restored['samePhoto'])
        self.assertTrue(restored['frozen'])
        self.assertFalse(restored['hasBytes'])
        self.assertEqual(restored['total'], 1)

    def test_reference_image_library_roundtrip(self):
        import base64
        payload = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC')
        self.open_modern()
        self.open_animation()
        panel = self.page.locator('#ModernReferenceImageLibrary')
        panel.locator('summary').first.click()
        expect(panel.get_by_role('status')).to_contain_text('ready')
        panel.locator('input[type=file]').set_input_files({'name': 'observation.png', 'mimeType': 'image/png', 'buffer': payload})
        expect(panel.get_by_role('status')).to_contain_text('Photograph imported')
        panel.get_by_label('Title', exact=True).fill('Causeway test')
        panel.get_by_label('Author', exact=True).fill('Observer')
        panel.get_by_text('Save details', exact=True).click()
        expect(panel.get_by_role('status')).to_contain_text('metadata saved')
        self.page.reload(wait_until='load')
        self.open_animation()
        panel.locator('summary').first.click()
        expect(panel.get_by_role('status')).to_contain_text('ready')
        panel.get_by_label('Saved observations').select_option(label='Causeway test (1 × 1)')
        expect(panel.get_by_label('Author', exact=True)).to_have_value('Observer')
        self.assertEqual(panel.get_by_text('Download original').get_attribute('href'),
                         'data:image/png;base64,' + base64.b64encode(payload).decode())
        expect(panel.get_by_text('Delete observation', exact=True)).to_be_disabled()
        expect(panel.get_by_text('Deletion is temporarily disabled', exact=False)).to_be_visible()

    def test_keyframe_reference_links_roundtrip(self):
        import base64
        payload = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC')
        self.open_modern()
        self.open_animation()
        self.create_camera_project('CI Reference Links')
        self.page.locator('#ModernAnimationViewLibrary').click()
        observations = self.page.locator('#ModernReferenceImageLibrary')
        observations.locator('summary').first.click()
        expect(observations.get_by_role('status')).to_contain_text('ready')
        observations.locator('input[type=file]').set_input_files({'name': 'observation.png', 'mimeType': 'image/png', 'buffer': payload})
        expect(observations.get_by_role('status')).to_contain_text('Photograph imported')
        self.page.locator('#ModernAnimationViewEditor').click()
        editor = self.page.locator('#ModernAnimationStudio')
        links = editor.locator('.modern-studio-reference-links')
        links.get_by_text('Load photographs', exact=True).click()
        expect(links.get_by_role('status')).to_contain_text('Local library loaded')
        photo_id = self.page.evaluate("async () => (await CurvatureModernReferenceImageLibrary.list(indexedDB))[0].id")
        expect(links.locator('.modern-reference-choice img')).to_be_visible()
        links.locator('.modern-reference-choice').filter(has_text='observation.png').click()
        links.get_by_text('Attach', exact=True).click()
        expect(links).to_contain_text('Reference photographs (1)')
        expect(links.locator('.modern-studio-reference-row')).to_contain_text('observation.png')
        expect(links.locator('.modern-studio-reference-row img')).to_be_visible()
        links.get_by_role('button', name='View original photograph 1').click()
        expect(links.locator('dialog img')).to_be_visible()
        links.get_by_text('Close photograph', exact=True).click()
        editor.locator('.modern-studio-edit-undo').last.click()
        expect(links).to_contain_text('Reference photographs (0)')
        editor.locator('.modern-studio-edit-redo').last.click()
        expect(links).to_contain_text('Reference photographs (1)')
        self.page.locator('#ModernAnimationViewLibrary').click()
        self.page.locator('#ModernAnimationLibrary').get_by_text('Save changes', exact=True).click()
        self.page.wait_for_function("async id => (await CurvatureModernAnimationLibrary.list(indexedDB))[0].project.keyframes[0].referenceImageIds?.[0] === id", arg=photo_id)
        self.page.reload(wait_until='load')
        self.open_animation()
        self.page.locator('#ModernAnimationViewEditor').click()
        expect(links.locator('.modern-studio-reference-row')).to_contain_text('observation.png')
        links.get_by_text('Unlink', exact=True).click()
        expect(links).to_contain_text('Reference photographs (0)')
        self.assertEqual(self.page.evaluate('async () => (await CurvatureModernReferenceImageLibrary.list(indexedDB)).length'), 1)

    def test_reference_portable_bundle_import_and_export(self):
        self.open_modern()
        self.open_animation()
        # A complete synthetic bundle from another browser, with a conflicting local ID.
        wire = self.page.evaluate("""async () => {
            const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC';
            const original = {dataUrl: png, width: 1, height: 1};
            const asset = {version: 1, id: 'portable_photo', title: 'Imported observation',
                           author: 'Observer', original};
            await CurvatureModernReferenceImageLibrary.create(indexedDB, {...asset, title: 'Local observation'});
            const draft = structuredClone(CurvatureModernDemoCatalog.load()[0].project);
            draft.keyframes[0].referenceImageIds = [asset.id];
            draft.keyframes[1].referenceImageIds = [asset.id];
            const entry = CurvatureModernAnimationLibrary.record(draft, 'auto', draft.id, 1, 1);
            return CurvatureModernAnimationLibrary.exportPortable([entry], undefined, {referenceImages: [asset]});
        }""")
        library = self.page.locator('#ModernAnimationLibrary')
        def import_bundle():
            library.get_by_label('Import animation JSON file').set_input_files({
                'name': 'portable.json', 'mimeType': 'application/json', 'buffer': wire.encode('utf-8')})
        import_bundle()
        expect(library.get_by_text('My Projects · 1', exact=True)).to_be_visible()
        result = self.page.evaluate("""async () => {
            const projects = await CurvatureModernAnimationLibrary.list(indexedDB);
            const ids = projects[0].project.keyframes.slice(0, 2).map(f => f.referenceImageIds[0]);
            return {ids, incoming: (await CurvatureModernReferenceImageLibrary.get(indexedDB, ids[0])).record,
                local: (await CurvatureModernReferenceImageLibrary.get(indexedDB, 'portable_photo')).record};
        }""")
        self.assertEqual(result['ids'][0], result['ids'][1])
        self.assertNotEqual(result['ids'][0], 'portable_photo')
        self.assertEqual(result['local']['title'], 'Local observation')
        self.assertEqual(result['incoming']['title'], 'Imported observation')
        with self.page.expect_download() as download:
            library.get_by_text('Export all', exact=True).click()
        exported = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
        self.assertEqual(exported['version'], 2)
        self.assertEqual(exported['referenceImages'], [result['incoming']])
        import_bundle()
        expect(library).to_contain_text('Imported 0 animations; 1 already present')
        self.assertEqual(self.page.evaluate('async () => (await CurvatureModernReferenceImageLibrary.list(indexedDB)).length'), 2)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def assert_preview_fills_panels(self):
        # CSS pixels, not the DPR-scaled backing dimensions.
        self.page.wait_for_function("""() => ['A', 'B'].every(side => {
            const host = document.getElementById('ModernAnimationCanvas' + side);
            const graph = window.CurvatureModernAnimationGraphs?.[side];
            const width = host.getBoundingClientRect().width;
            if (width < 2) return true;
            const canvas = graph?.Canvas;
            const rect = canvas?.getBoundingClientRect();
            return rect && rect.width > 2 && Math.abs(width - rect.width - 2*graph.BorderWidth) <= 2
                && Math.abs(rect.height/rect.width - 0.6667) < 0.01
                && Math.abs(canvas.height/canvas.width - 0.6667) < 0.01
                && document.getElementById('ModernAnimationFrameLoading' + side).hidden;
        })""", timeout=30000)

    def test_soundly_reference_presentation_layout(self):
        import base64
        payload = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC')
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        self.page.locator('#ModernAnimationViewLibrary').click()
        observations = self.page.locator('#ModernReferenceImageLibrary')
        observations.locator('summary').first.click()
        expect(observations.get_by_role('status')).to_contain_text('ready')
        observations.locator('input[type=file]').set_input_files({'name': 'observation.png', 'mimeType': 'image/png', 'buffer': payload})
        expect(observations.get_by_role('status')).to_contain_text('Photograph imported')
        self.page.locator('#ModernAnimationViewEditor').click()
        editor = self.page.locator('#ModernAnimationStudio')
        expect(editor.locator('.modern-studio-frame-panel')).to_be_visible()
        editor.locator('.modern-studio-keyframe').first.click()
        links = editor.locator('.modern-studio-reference-links')
        links.get_by_text('Load photographs', exact=True).click()
        expect(links.locator('.modern-reference-choice img')).to_be_visible()
        links.locator('.modern-reference-choice').first.click()
        links.get_by_text('Attach', exact=True).click()
        editor.locator('.modern-studio-keyframe').first.click()
        self.page.locator('#ModernAnimationViewPreview').click()
        expect(self.page.locator('#ModernAnimationPreviewView')).to_be_visible()
        ref_panel = self.page.locator('#ModernAnimationReferencePanel')
        layout = self.page.locator('#ModernAnimationReferenceLayout')
        expect(ref_panel.locator('img')).to_be_visible(timeout=30000)
        self.assert_preview_fills_panels()
        layout.select_option('below')
        expect(self.page.locator('#ModernAnimationPlaybackPanels')).to_have_class(re.compile('has-reference-below'))
        self.assert_preview_fills_panels()
        layout.select_option('hidden')
        expect(ref_panel).to_be_hidden()
        self.assert_preview_fills_panels()
        layout.select_option('side')
        expect(ref_panel.locator('img')).to_be_visible()
        self.assert_preview_fills_panels()
        self.page.locator('#ModernAnimationPresent').click()
        expect(ref_panel.locator('img')).to_be_visible()
        self.assert_preview_fills_panels()
        chapter = self.page.locator('#ModernAnimationNarrativeNavigation')
        chapter.select_option('6')
        expect(ref_panel).to_be_hidden()
        self.assert_preview_fills_panels()
        chapter.select_option('0')
        expect(ref_panel.locator('img')).to_be_visible()
        self.assert_preview_fills_panels()
        ref_panel.get_by_text('View original & details').click()
        expect(self.page.locator('#ModernAnimationPlaybackStage dialog img')).to_be_visible()
        self.page.locator('#ModernAnimationPlaybackStage dialog').get_by_text('Close photograph').click()
        self.page.locator('#ModernAnimationPresentationExit').click()
        splitter = self.page.locator('#ModernAnimationReferenceSplitter')
        splitter.focus()
        self.page.keyboard.press('ArrowRight')
        expect(splitter).to_have_attribute('aria-valuenow', '35')
        self.assert_preview_fills_panels()
        self.page.locator('#ModernAnimationPlaybackSeek').evaluate("el => {el.value=100;el.dispatchEvent(new Event('input',{bubbles:true}));}")
        expect(ref_panel.locator('img')).to_be_hidden()
        self.page.locator('#ModernAnimationViewEditor').click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        editor.locator('.modern-studio-keyframe').first.click()
        self.page.locator('#ModernAnimationViewPreview').click()
        expect(ref_panel.locator('img')).to_be_visible()
        # Real Studio copy, reference import/attachment and HTTP worker imports.
        export = self.page.locator('#ModernAnimationFrameExportStart').locator('xpath=ancestor::details[1]')
        if export.get_attribute('open') is None:
            export.locator('summary').click()
        self.page.locator('#ModernAnimationFrameExportMode').select_option('presentation')
        self.page.locator('#ModernAnimationFrameExportPresentationSize').select_option('1280')
        self.page.locator('#ModernAnimationFrameExportFps').select_option('25')
        self.page.locator('#ModernAnimationFrameExportDestination').select_option('memory')
        self.page.locator('#ModernAnimationFrameExportStart').click()
        status = self.page.locator('#ModernAnimationFrameExportStatus')
        expect(status).to_contain_text('1479 requested; maximum 751')
        self.page.locator('#ModernAnimationFrameExportPreview').click()
        expect(status).to_contain_text('Presentation preview ready', timeout=120000)
        expect(self.page.locator('#ModernAnimationFrameExportPreviewImage')).to_be_visible()
        with self.page.expect_download() as download:
            self.page.locator('#ModernAnimationFrameExportPreviewSave').click()
        self.assertTrue(download.value.suggested_filename.endswith('.zip'))

    def test_shipped_demo_catalog_http(self):
        self.open_modern()
        self.assert_shipped_demo_catalog()

    def test_shipped_demo_catalog_file(self):
        # Local classic script resources must work without fetch(file://).
        self.page.goto((ROOT / 'CurvatureModern.html').as_uri(), wait_until='load', timeout=30000)
        self.assert_shipped_demo_catalog()

    def test_soundly_compare_playback_seek_and_restart(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        stage = self.page.locator('#ModernAnimationPlaybackStage')
        expect(stage).to_be_visible()
        expect(self.page.locator('#ModernAnimationPlaybackLabelA')).to_have_text('Model A · Globe · vacuum')
        expect(self.page.locator('#ModernAnimationPlaybackLabelB')).to_have_text('Model B · Flat · vacuum')
        expect(self.page.locator('#ModernAnimationPlaybackViewB')).to_be_visible()
        expect(self.page.locator('#ModernAnimationPlaybackOptics')).to_have_value('canvas-direct')
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('B: canvas-direct', timeout=30000)
        seek = self.page.locator('#ModernAnimationPlaybackSeek')
        seek.evaluate("el => { el.value = 400; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        expect(diag).to_contain_text('Rendered t=23.64s')
        self.page.locator('#ModernAnimationPlaybackPlay').click()
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback().positionMs > 23640')
        self.page.locator('#ModernAnimationPlaybackPause').click()
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        self.page.locator('#ModernAnimationPlaybackStop').click()
        expect(diag).to_contain_text('Rendered t=0.00s')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 0)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_keyframe_navigation_and_personal_auto_prepare(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        cards = self.page.locator('#ModernAnimationStoryboard .modern-animation-storyboard-card')
        # The first jump must paint before Play has ever been clicked.
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        cards.nth(1).click()
        expect(diag).to_contain_text('Rendered t=8.50s')
        self.page.locator('#ModernAnimationPlaybackPlay').click()
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        expect(cards.nth(3)).to_have_attribute('aria-pressed', 'true')
        expect(self.page.locator('#ModernAnimationPlaybackTime')).to_contain_text('20.95 / 59.10 s')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 20950)
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        cards.nth(0).click()
        expect(diag).to_contain_text('Rendered t=0.00s')
        self.page.locator('#ModernAnimationPlaybackStop').click()
        cards.nth(5).click()
        expect(diag).to_contain_text('Rendered t=35.40s')
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        self.page.locator('#ModernAnimationViewLibrary').click()
        library.locator('[data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        expect(cards).to_have_count(9)
        self.page.wait_for_function('CurvatureModernApp.getBuiltInDemo() === null')
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        editor = self.page.locator('#ModernAnimationStudio')
        timeline = editor.locator('.modern-studio-filmstrip')
        inspector = editor.locator('.modern-studio-inspector-pane')
        expect(timeline).to_be_visible()
        expect(inspector.locator('.modern-studio-frame-panel')).to_be_visible()
        inspector.get_by_role('button', name='Inspect project settings').click()
        expect(inspector.locator('.modern-studio-project-panel')).to_be_visible()
        self.page.locator('#ModernAnimationViewPreview').click()
        cards.nth(2).click()
        expect(diag).to_contain_text('Rendered t=15.00s')
        self.page.locator('#ModernAnimationViewEditor').click()
        expect(timeline).to_be_visible()
        expect(timeline.locator('.modern-studio-keyframe').nth(2)).to_have_attribute('aria-pressed', 'true')
        expect(inspector.locator('.modern-studio-project-panel')).to_be_visible()
        name = editor.get_by_label('Project name')
        name.fill('Soundly navigation check')
        name.press('Tab')
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback() === null')
        self.page.locator('#ModernAnimationStudio .modern-studio-keyframe').nth(3).click()
        self.page.locator('#ModernAnimationViewPreview').click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        expect(cards.nth(3)).to_have_attribute('aria-pressed', 'true')
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_presentation_reuses_player_and_storyboard(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        stage = self.page.locator('#ModernAnimationPlaybackStage')
        self.page.locator('#ModernAnimationPresent').click()
        expect(stage).to_have_class(re.compile('is-presenting'))
        expect(self.page.locator('#ModernAnimationPresentationTitle')).to_contain_text('Soundly')
        expect(self.page.locator('#ModernAnimationPlaybackOptics')).not_to_be_visible()
        expect(self.page.locator('#ModernAnimationPlaybackQuality')).to_be_visible()
        self.assertTrue(self.page.locator('#ModernAnimationLibrary').evaluate('(el) => el.inert'))
        story = self.page.locator('#ModernAnimationStoryboard')
        cards = story.locator('.modern-animation-storyboard-card')
        settings = self.page.locator('#ModernAnimationPresentationSettingsToggle')
        toggle = self.page.locator('#ModernAnimationPresentationStoryboardToggle')
        expect(story).to_be_hidden()
        expect(self.page.locator('#ModernAnimationPlaybackRetry')).to_be_hidden()
        expect(self.page.locator('#ModernAnimationPlaybackStatus')).to_be_hidden()
        expect(self.page.locator('#ModernAnimationAtmosphere')).to_be_hidden()
        settings.click()
        expect(settings).to_have_attribute('aria-expanded', 'true')
        expect(self.page.locator('#ModernAnimationAtmosphere')).to_be_visible()
        self.assert_preview_fills_panels()
        settings.click()
        expect(self.page.locator('#ModernAnimationAtmosphere')).to_be_hidden()
        toggle.click()
        expect(toggle).to_have_attribute('aria-expanded', 'true')
        self.assert_preview_fills_panels()
        expect(cards).to_have_count(9)
        for name in ('Capture all keyframes', 'Regenerate all thumbnails', 'Export with thumbnails', 'Export without thumbnails'):
            author_action = story.get_by_text(name, exact=True)
            expect(author_action).to_have_count(1)
            expect(author_action).to_be_hidden()
        expect(story.locator('.modern-animation-author-only').first).to_be_hidden()
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        expect(self.page.locator('#ModernAnimationPresentationFrame')).to_contain_text('4 / 9')
        toggle.click()
        expect(story).to_be_hidden()
        # Exercise the conditional recovery chrome without changing the renderer.
        self.assertTrue(stage.evaluate("""el => {
            const notice = el.querySelector('#ModernAnimationFrameLoadingA');
            const status = el.querySelector('#ModernAnimationPlaybackStatus');
            const old = status.getAttribute('data-status-kind'), hidden = notice.hidden;
            notice.classList.add('is-failed'); notice.hidden = false;
            status.setAttribute('data-status-kind', 'warning');
            const visible = id => getComputedStyle(el.querySelector('#'+id)).display !== 'none';
            const result = visible('ModernAnimationPlaybackRetry') && visible('ModernAnimationPlaybackStatus');
            notice.classList.remove('is-failed'); notice.hidden = hidden;
            if (old === null) status.removeAttribute('data-status-kind'); else status.setAttribute('data-status-kind', old);
            return result;
        }"""))
        self.page.set_viewport_size({'width': 1200, 'height': 800})
        self.assert_preview_fills_panels()
        expect(self.page.locator('#ModernAnimationPlaybackTime')).to_contain_text('20.95')
        self.page.keyboard.press('Escape')
        expect(stage).not_to_have_class(re.compile('is-presenting'))
        self.assert_preview_fills_panels()
        expect(self.page.locator('#ModernAnimationPlaybackTime')).to_contain_text('20.95')
        self.assertFalse(self.page.locator('#ModernAnimationLibrary').evaluate('(el) => el.inert'))
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'), 'soundly')
        expect(story.get_by_role('button', name='Export without thumbnails', exact=True)).to_be_visible()
        expect(self.page.locator('#ModernAnimationAtmosphere')).to_be_visible()
        expect(self.page.locator('#ModernAnimationPlaybackRetry')).to_be_visible()
        expect(settings).to_be_hidden()
        self.page.locator('#ModernAnimationPresent').click()
        expect(story).to_be_hidden()
        self.page.locator('#ModernAnimationPresentationExit').click()

    def test_soundly_atmosphere_switch_preserves_authored_project_and_playhead(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        cards = self.page.locator('#ModernAnimationStoryboard .modern-animation-storyboard-card')
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        switch = self.page.locator('#ModernAnimationAtmosphere')
        authored = self.page.evaluate('CurvatureModernApp.getAnimationStudioProject()')
        expect(switch).to_have_value('vacuum')
        self.page.locator('#ModernAnimationPresent').click()
        self.page.locator('#ModernAnimationPresentationSettingsToggle').click()
        expect(switch).to_be_visible()
        switch.select_option('standard')
        expect(self.page.locator('#ModernAnimationPlaybackLabelA')).to_have_text('Model A · Globe · standard', timeout=30000)
        expect(self.page.locator('#ModernAnimationPlaybackLabelB')).to_have_text('Model B · Flat · standard')
        expect(diag).to_contain_text('Rendered t=20.95s')
        expect(cards.nth(3)).to_have_attribute('aria-pressed', 'true')
        self.assertEqual(cards.nth(3).locator('img').count(), 0)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioProject()'), authored)
        self.page.locator('#ModernAnimationPresentationExit').click()
        story = self.page.locator('#ModernAnimationStoryboard')
        with self.page.expect_download(timeout=60000) as download:
            story.get_by_role('button', name='Export with thumbnails (standard)', exact=True).click()
        self.assertIn('-standard-', download.value.suggested_filename)
        variant = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))['animations'][0]
        self.assertEqual(len(variant['keyframeThumbnails']), 9)
        self.assertEqual(variant['project']['baseExperiment']['compare']['A']['atmosphere'], 'standard')
        self.assertEqual(variant['project']['baseExperiment']['compare']['B']['atmosphere'], 'standard')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioProject()'), authored)
        switch.select_option('vacuum')
        expect(self.page.locator('#ModernAnimationPlaybackLabelA')).to_have_text('Model A · Globe · vacuum')
        expect(cards.nth(3).locator('img')).to_have_count(1)
        expect(switch).to_have_value('vacuum')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 20950)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_copy_narrative_follows_storyboard_and_is_plain_text(self):
        self.open_modern()
        self.open_animation()
        demo = self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]')
        demo.get_by_text('Create copy', exact=True).click()
        editor = self.page.locator('#ModernAnimationStudio')
        expect(editor.locator('.modern-studio-frame-panel')).to_be_visible()
        editor.locator('.modern-studio-keyframe').nth(3).click()
        heading = editor.get_by_label('Presentation title (optional)')
        heading.fill('Real observation')
        heading.press('Tab')
        caption = editor.get_by_label('Frame explanation (optional)')
        literal = '<b>Low view</b>\nBridge explanation'
        caption.fill(literal)
        caption.press('Tab')
        editor.locator('.modern-studio-keyframe').nth(3).click()
        # A hidden Preview retains the playhead, but optical painting waits
        # until its mounted viewport becomes visible again.
        self.page.locator('#ModernAnimationViewPreview').click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        self.page.locator('#ModernAnimationPresent').click()
        narrative = self.page.locator('#ModernAnimationPresentationNarrative')
        text = self.page.locator('#ModernAnimationPresentationNarrativeText')
        expect(narrative).to_be_visible()
        expect(text).to_have_text(literal)
        expect(text.locator('b')).to_have_count(0)
        expect(self.page.locator('#ModernAnimationPresentationNarrativeLabel')).to_have_text('4 / 9 · Real observation')
        self.page.locator('#ModernAnimationPresentationSettingsToggle').click()
        visibility = self.page.get_by_label('Show explanations')
        visibility.uncheck()
        expect(narrative).not_to_be_visible()
        visibility.check()
        expect(narrative).to_be_visible()
        navigation = self.page.get_by_label('Presentation chapter')
        navigation.select_option('4')
        expect(text).to_be_empty()
        navigation.select_option('3')
        expect(text).to_have_text(literal)
        self.page.keyboard.press('Escape')
        expect(narrative).not_to_be_visible()

    def test_soundly_lazy_keyframe_thumbnails(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        story = self.page.locator('#ModernAnimationStoryboard')
        cards = story.locator('.modern-animation-storyboard-card')
        expect(cards.locator('img')).to_have_count(0)
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        image = cards.nth(3).locator('img')
        expect(image).to_have_attribute('src', re.compile(r'^data:image/(webp|png);base64,'))
        expect(cards.locator('img')).to_have_count(1)
        story.get_by_label('Capture selected keyframe thumbnail').click()
        expect(image).to_be_visible()
        cards.nth(1).click()
        expect(diag).to_contain_text('Rendered t=8.50s')
        expect(cards.locator('img')).to_have_count(2)
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'), 'soundly')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_complete_storyboard_export_preserves_playhead(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        story = self.page.locator('#ModernAnimationStoryboard')
        cards = story.locator('.modern-animation-storyboard-card')
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        before = self.page.evaluate('CurvatureModernApp.getStudioPlayback()')
        with self.page.expect_download(timeout=60000) as download:
            story.get_by_role('button', name='Export with thumbnails', exact=True).click()
        exported = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
        self.assertEqual(len(exported['animations'][0]['keyframeThumbnails']), 9)
        expect(cards.locator('img')).to_have_count(9)
        after = self.page.evaluate('CurvatureModernApp.getStudioPlayback()')
        self.assertEqual(after['positionMs'], before['positionMs'])
        self.assertEqual(after['playing'], before['playing'])
        expect(cards.nth(3)).to_have_attribute('aria-pressed', 'true')
        with self.page.expect_download() as download:
            story.get_by_role('button', name='Export without thumbnails', exact=True).click()
        compact = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
        self.assertNotIn('keyframeThumbnails', compact['animations'][0])
        self.assertEqual(compact['animations'][0]['project'], exported['animations'][0]['project'])
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_keyframe_thumbnails_survive_reload_and_copy(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        demo = library.locator('[data-demo-id="soundly"]')
        demo.get_by_text('Open demo', exact=True).click()
        cards = self.page.locator('#ModernAnimationStoryboard .modern-animation-storyboard-card')
        expect(cards).to_have_count(9)
        cards.nth(3).click()
        image = cards.nth(3).locator('img')
        expect(image).to_have_attribute('src', re.compile(r'^data:image/(webp|png);base64,'))
        original = image.get_attribute('src')
        self.page.wait_for_function("""async () => {
            const rows = await CurvatureModernExperimentThumbnail.createKeyframePersistence(indexedDB).read();
            return rows.some(row => row.image.dataUrl === %s);
        }""" % json.dumps(original))
        self.page.reload(wait_until='load')
        self.open_animation()
        demo.get_by_text('Open demo', exact=True).click()
        expect(image).to_have_attribute('src', original)
        self.page.locator('#ModernAnimationViewLibrary').click()
        expect(self.page.locator('#ModernAnimationLibraryView')).to_be_visible()
        demo.get_by_text('Create copy', exact=True).click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        self.page.wait_for_function('CurvatureModernApp.getBuiltInDemo() === null')
        expect(image).to_have_attribute('src', original)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_builtin_demo_readonly_copy_and_reload(self):
        self.open_modern()
        self.open_animation()
        studio = self.page.locator('#ModernAnimationStudio')
        library = self.page.locator('#ModernAnimationLibrary')
        self.page.locator('#ModernAnimationViewEditor').click()
        name = studio.get_by_label('Project name')
        name.fill('Retained user draft')
        expect(name).to_have_value('Retained user draft')
        self.page.wait_for_timeout(750)
        self.page.locator('#ModernAnimationViewLibrary').click()
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        expect(studio).to_contain_text('Built-in demo · Read-only')
        expect(self.page.locator('#ModernAnimationStoryboard .modern-animation-storyboard-card')).to_have_count(9)
        expect(studio.locator('.modern-studio-keyframe')).to_have_count(0)
        expect(studio.get_by_label('Project name')).to_have_count(0)
        expect(self.page.locator('#ModernAnimationPlaybackInterpolation')).to_be_disabled()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'), 'soundly')
        self.assertEqual(self.page.evaluate("""async () =>
            (await CurvatureModernAnimationLibrary.list(indexedDB)).length"""), 0)
        self.page.locator('#ModernAnimationViewLibrary').click()
        library.get_by_text('Close demo', exact=True).click()
        expect(studio.get_by_label('Project name')).to_have_value('Retained user draft')
        self.page.locator('#ModernAnimationViewLibrary').click()
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        expect(studio).to_contain_text('Built-in demo · Read-only')
        self.page.locator('#ModernAnimationViewLibrary').click()
        library.locator('[data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        expect(studio.get_by_label('Project name')).to_have_value(
            'Soundly Causeway · Bridge Camera Study (copy)')
        self.assertIsNone(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'))
        self.assertTrue(self.page.evaluate("""async () => {
            const rows = await CurvatureModernAnimationLibrary.list(indexedDB);
            const demo = CurvatureModernDemoCatalog.load()[0];
            return rows.length === 1 && rows[0].id !== demo.project.id &&
                rows[0].cover.startsWith('data:image/png;base64,');
        }"""))
        # Reloading while viewing a demo restores the last user project, not
        # a serialized editable version of the built-in.
        self.page.locator('#ModernAnimationViewLibrary').click()
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        expect(studio).to_contain_text('Built-in demo · Read-only')
        self.page.reload(wait_until='load')
        self.open_animation()
        self.page.locator('#ModernAnimationViewEditor').click()
        expect(studio.get_by_label('Project name')).to_have_value(
            'Soundly Causeway · Bridge Camera Study (copy)')
        self.assertIsNone(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_demo_catalog_cards_and_direct_copy(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        studio = self.page.locator('#ModernAnimationStudio')
        demo = library.locator('[data-demo-id="soundly"]')
        expect(library.get_by_text('Built-in Demos · 1', exact=True)).to_be_visible()
        expect(library.get_by_text('My Projects · 0', exact=True)).to_be_visible()
        expect(demo.locator('.modern-animation-library-cover-image')).to_be_visible()
        expect(demo.locator('img')).to_have_js_property('complete', True)
        self.assertGreater(demo.locator('img').evaluate('(img) => img.naturalWidth'), 0)
        expect(demo.locator('.modern-card-delete')).to_have_count(0)
        expect(demo.get_by_role('button', name='Rename')).to_have_count(0)
        with self.page.expect_download() as download:
            demo.get_by_text('Export demo', exact=True).click()
        self.assertRegex(download.value.suggested_filename, r'^soundly-causeway-bridge-camera-study-vacuum-\d{8}-\d{6}-\d{3}(?:-with-thumbnails)?\.json$')
        exported = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))['animations'][0]
        self.assertEqual(exported['project']['baseExperiment']['compare']['A']['atmosphere'], 'vacuum')
        self.assertEqual(exported['project']['baseExperiment']['compare']['B']['atmosphere'], 'vacuum')
        self.page.locator('#ModernAnimationViewEditor').click()
        studio.get_by_label('Project name').fill('Keep original work')
        self.page.wait_for_timeout(750)
        self.page.locator('#ModernAnimationViewLibrary').click()
        copy = demo.get_by_text('Create copy', exact=True)
        copy.focus()
        copy.press('Enter')
        expect(studio.get_by_label('Project name')).to_have_value(
            'Soundly Causeway · Bridge Camera Study (copy)')
        self.page.locator('#ModernAnimationViewLibrary').click()
        expect(library.get_by_text('My Projects · 1', exact=True)).to_be_visible()
        personal = library.locator('[data-animation-id]')
        expect(personal).to_have_count(1)
        expect(personal.locator('.modern-animation-library-cover-image')).to_have_attribute(
            'src', re.compile('^data:image/png;base64,'))
        expect(demo.locator('.modern-demo-card-status')).to_have_text('Built-in · Read-only')
        expect(library).to_contain_text('Keep original work')
        personal.click()
        expect(demo).not_to_have_class(re.compile('is-selected'))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_personal_cover_editor_and_default_demo_optics(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        demo = library.locator('[data-demo-id="soundly"]')
        optics = self.page.locator('#ModernAnimationPlaybackOptics')
        demo.get_by_text('Open demo', exact=True).click()
        expect(optics).to_have_value('canvas-direct')
        self.page.locator('#ModernAnimationViewLibrary').click()
        demo.get_by_text('Create copy', exact=True).click()
        self.page.locator('#ModernAnimationViewLibrary').click()
        personal = library.locator('[data-animation-id]')
        expect(personal).to_have_count(1)
        expect(optics).to_have_value('canvas-direct')
        expect(personal.get_by_text('Remove cover', exact=True)).to_be_enabled()
        original = personal.locator('.modern-animation-library-cover-image').get_attribute('src')
        personal.get_by_text('Remove cover', exact=True).click()
        expect(personal.locator('.modern-animation-library-cover-image')).to_have_count(0)
        personal.locator('input[type=file]').set_input_files(str(ROOT / 'demos/modern/covers/soundly.png'))
        expect(personal.locator('.modern-animation-library-cover-image')).to_have_attribute(
            'src', re.compile('^data:image/jpeg;base64,'))
        expect(personal.get_by_text('Capture frame', exact=True)).to_be_enabled()
        self.page.locator('#ModernAnimationViewPreview').click()
        # Wait for the initial paused preview to complete before capturing.
        expect(self.page.locator('#ModernAnimationFrameLoadingA')).to_be_hidden(timeout=30000)
        self.page.locator('#ModernAnimationViewLibrary').click()
        personal.get_by_text('Capture frame', exact=True).click()
        expect(personal.locator('.modern-animation-library-cover-image')).to_have_attribute(
            'src', re.compile('^data:image/(webp|png);base64,'))
        self.assertTrue(self.page.evaluate("""async () => {
            const rows = await CurvatureModernAnimationLibrary.list(indexedDB);
            return rows.length === 1 && rows[0].quality === 'canvas-direct' &&
              /^data:image\\/(webp|png);base64,/.test(rows[0].cover);
        }"""))
        self.assertIsNotNone(original)
        expect(demo.locator('.modern-animation-library-cover-image')).to_have_attribute(
            'src', 'demos/modern/covers/soundly.png')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)


    def test_animation_studio_view_url_back_forward_and_reload(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationViewLibrary')
        editor = self.page.locator('#ModernAnimationViewEditor')
        preview = self.page.locator('#ModernAnimationViewPreview')
        expect(library).to_have_attribute('aria-selected', 'true')
        editor.click()
        self.assertEqual(self.page.evaluate("new URL(location.href).searchParams.get('studioView')"), 'editor')
        self.page.locator('#ModernAnimationStudio').get_by_label('Project name').fill('URL view retention')
        preview.click()
        self.assertEqual(self.page.evaluate("new URL(location.href).searchParams.get('studioView')"), 'preview')
        self.page.go_back()
        expect(editor).to_have_attribute('aria-selected', 'true')
        expect(self.page.locator('#ModernAnimationStudio').get_by_label('Project name')).to_have_value('URL view retention')
        self.page.go_forward()
        expect(preview).to_have_attribute('aria-selected', 'true')
        self.page.reload()
        expect(preview).to_have_attribute('aria-selected', 'true')
        editor.click()
        expect(self.page.locator('#ModernAnimationStudio').get_by_label('Project name')).to_have_value('URL view retention')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)


    def test_animation_studio_editor_field_focus_survives_view_navigation(self):
        self.open_modern()
        self.open_animation()
        editor_tab = self.page.locator('#ModernAnimationViewEditor')
        preview_tab = self.page.locator('#ModernAnimationViewPreview')
        editor_tab.click()
        field = self.page.locator('#ModernAnimationStudio').get_by_label('Project name')
        field.fill('Focus and caret survive')
        field.focus()
        field.evaluate('el => el.setSelectionRange(5, 5)')
        preview_tab.click()
        editor_tab.click()
        expect(field).to_have_value('Focus and caret survive')
        self.assertTrue(field.evaluate('el => document.activeElement === el'))
        self.assertEqual(field.evaluate('el => el.selectionStart'), 5)
        editor_tab.focus()
        self.page.keyboard.press('ArrowRight')
        expect(preview_tab).to_have_attribute('aria-selected', 'true')
        self.assertTrue(preview_tab.evaluate('el => document.activeElement === el'))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_animation_studio_route_priority_and_selected_keyframe_history(self):
        self.open_modern()
        self.page.goto(self.base_url + '?mode=scene&studioView=preview', wait_until='load')
        expect(self.page.locator('#ModernAnimationWorkspace')).to_be_hidden()
        self.page.goto(self.base_url + '?studioView=editor', wait_until='load')
        expect(self.page.locator('#ModernAnimationWorkspace')).to_be_visible()
        expect(self.page.locator('#ModernAnimationViewEditor')).to_be_visible()
        self.page.locator('#ModernAnimationViewLibrary').click()
        demo = self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]')
        demo.get_by_text('Create copy', exact=True).click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        strip = self.page.locator('#ModernAnimationStudio .modern-studio-keyframe')
        expect(strip).to_have_count(9)
        strip.nth(3).click()
        key = self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().selectedKey')
        self.assertIsNotNone(key)
        self.page.locator('#ModernAnimationViewPreview').click()
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback().positionMs === 20950')
        self.page.go_back()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().selectedKey'), key)
        self.page.go_forward()
        expect(self.page.locator('#ModernAnimationPreviewView')).to_be_visible()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().selectedKey'), key)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 20950)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_animation_preview_tab_prepares_compatible_draft_without_editor_button(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        library.locator('[data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        studio = self.page.locator('#ModernAnimationStudio')
        expect(studio.locator('.modern-studio-preview-bar')).to_have_count(0)
        editor_tab = self.page.locator('#ModernAnimationViewEditor')
        preview_tab = self.page.locator('#ModernAnimationViewPreview')
        studio.get_by_label('Frame name').fill('Changed keyframe for lazy preview')
        self.assertIsNone(self.page.evaluate('CurvatureModernApp.getStudioPlayback()'))
        preview_tab.click()
        expect(self.page.locator('#ModernAnimationPlaybackStage')).to_be_visible()
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback() !== null')
        self.page.wait_for_function('document.querySelector("#ModernAnimationPlaybackStatus")?.textContent.includes("ready")')
        position = self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs')
        editor_tab.click()
        preview_tab.click()
        expect(self.page.locator('#ModernAnimationPlaybackStage')).to_be_visible()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), position)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_animation_preview_short_png_and_webm_exports_produce_real_files(self):
        import struct
        import zipfile

        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        editor = self.page.locator('#ModernAnimationStudio')
        # A short, compatible, two-keyframe real project keeps this browser
        # acceptance focused; no long 59-second video render is started.
        for _ in range(7):
            editor.locator('.modern-studio-filmstrip-item').nth(2).locator(
                '.modern-card-delete').click(force=True)
        expect(editor.locator('.modern-studio-filmstrip-item')).to_have_count(2)
        editor.get_by_label('Hold after arrival (s)').fill('0.1')
        editor.get_by_label('Hold after arrival (s)').press('Tab')
        editor.locator('.modern-studio-card-actions').nth(1).get_by_role(
            'button', name='Properties for').click()
        editor.get_by_label('Travel to frame (s)').fill('0.2')
        editor.get_by_label('Travel to frame (s)').press('Tab')
        editor.get_by_label('Hold after arrival (s)').fill('0.1')
        editor.get_by_label('Hold after arrival (s)').press('Tab')
        self.page.locator('#ModernAnimationViewPreview').click()
        expect(self.page.locator('#ModernAnimationPlaybackStage')).to_be_visible()
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback() !== null')
        before = self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs')

        png = self.page.locator('#ModernAnimationFrameExportSection')
        png.locator('summary').click()
        self.page.locator('#ModernAnimationFrameExportFps').select_option('5')
        self.page.locator('#ModernAnimationFrameExportSize').select_option('640x360')
        self.page.locator('#ModernAnimationFrameExportRenderer').select_option('canvas-direct')
        self.page.locator('#ModernAnimationFrameExportWorkers').select_option('1')
        self.page.locator('#ModernAnimationFrameExportDestination').select_option('memory')
        with self.page.expect_download(timeout=120000) as download:
            self.page.locator('#ModernAnimationFrameExportStart').click()
        archive = Path(download.value.path())
        self.assertTrue(download.value.suggested_filename.endswith('.zip'))
        with zipfile.ZipFile(archive) as z:
            self.assertIsNone(z.testzip(), 'every ZIP member passes CRC verification')
            names = z.namelist()
            frames = [name for name in names if name.endswith('.png')]
            self.assertGreaterEqual(len(frames), 2)
            first = z.read(frames[0])
            self.assertEqual(first[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack('>II', first[16:24]), (640, 360))
            self.assertGreater(len(first), 1000)
        expect(self.page.locator('#ModernAnimationFrameExportStatus')).to_contain_text(
            'PNG archive ready')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), before)

        video = self.page.locator('#ModernAnimationVideoExportSection')
        video.locator('summary').click()
        self.page.locator('#ModernAnimationVideoExportFormat').select_option('webm')
        self.page.locator('#ModernAnimationVideoExportFps').select_option('5')
        self.page.locator('#ModernAnimationVideoExportSize').select_option('640x360')
        self.page.locator('#ModernAnimationVideoExportRenderer').select_option('canvas-direct')
        self.page.locator('#ModernAnimationVideoExportWorkers').select_option('1')
        with self.page.expect_download(timeout=120000) as download:
            self.page.locator('#ModernAnimationVideoExportStart').click()
        video_file = Path(download.value.path())
        self.assertTrue(download.value.suggested_filename.endswith('.webm'))
        video_bytes = video_file.read_bytes()
        self.assertTrue(video_bytes.startswith(b'\x1a\x45\xdf\xa3'), 'valid WebM EBML header')
        self.assertGreater(len(video_bytes), 1000)
        expect(self.page.locator('#ModernAnimationVideoExportStatus')).to_contain_text(
            'export ready:')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), before)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_animation_preview_png_video_cancellation_and_keyboard_focus(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        self.page.locator('#ModernAnimationViewPreview').click()
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback() !== null')
        downloads = []
        self.page.on('download', lambda item: downloads.append(item.suggested_filename))

        png = self.page.locator('#ModernAnimationFrameExportSection')
        png.locator('summary').click()
        self.page.locator('#ModernAnimationFrameExportFps').select_option('5')
        self.page.locator('#ModernAnimationFrameExportSize').select_option('640x360')
        self.page.locator('#ModernAnimationFrameExportRenderer').select_option('canvas-direct')
        self.page.locator('#ModernAnimationFrameExportDestination').select_option('memory')
        self.page.locator('#ModernAnimationFrameExportStart').click()
        cancel_png = self.page.locator('#ModernAnimationFrameExportCancel')
        expect(cancel_png).to_be_enabled()
        cancel_png.click()
        expect(self.page.locator('#ModernAnimationFrameExportStatus')).to_contain_text(
            'cancelled', timeout=30000)
        expect(self.page.locator('#ModernAnimationFrameExportStart')).to_be_enabled(timeout=30000)

        video = self.page.locator('#ModernAnimationVideoExportSection')
        video.locator('summary').click()
        self.page.locator('#ModernAnimationVideoExportFps').select_option('5')
        self.page.locator('#ModernAnimationVideoExportSize').select_option('640x360')
        self.page.locator('#ModernAnimationVideoExportRenderer').select_option('canvas-direct')
        self.page.locator('#ModernAnimationVideoExportStart').click()
        cancel_video = self.page.locator('#ModernAnimationVideoExportCancel')
        expect(cancel_video).to_be_enabled()
        cancel_video.click()
        expect(self.page.locator('#ModernAnimationVideoExportStatus')).to_contain_text(
            'cancelled', timeout=30000)
        expect(self.page.locator('#ModernAnimationVideoExportStart')).to_be_enabled(timeout=30000)
        self.assertEqual(downloads, [], 'cancelled exports must not produce a file')

        preview_tab = self.page.locator('#ModernAnimationViewPreview')
        preview_tab.focus()
        self.page.keyboard.press('ArrowLeft')
        expect(self.page.locator('#ModernAnimationViewEditor')).to_have_attribute(
            'aria-selected', 'true')
        self.page.keyboard.press('ArrowRight')
        expect(preview_tab).to_have_attribute('aria-selected', 'true')
        expect(self.page.locator('#ModernAnimationPlaybackStage')).to_be_visible()
        self.assertIsNotNone(self.page.evaluate('CurvatureModernApp.getStudioPlayback()'))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_animation_preview_reuses_painted_frame_and_preserves_render_export_controls(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        studio = self.page.locator('#ModernAnimationStudio')
        studio.locator('.modern-studio-keyframe').nth(3).click()
        preview = self.page.locator('#ModernAnimationPreviewView')
        expect(preview).to_be_visible()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 20950)
        self.page.locator('#ModernAnimationViewEditor').click()
        # Properties is selection only: it must not invalidate the prepared frame.
        studio.locator('.modern-studio-card-actions').nth(3).get_by_role('button', name='Properties for').click()
        self.assertIsNotNone(self.page.evaluate('CurvatureModernApp.getStudioPlayback()'))
        studio.locator('.modern-studio-keyframe').nth(3).click()
        expect(preview).to_be_visible()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 20950)
        expect(diag).to_contain_text('Rendered t=20.95s')
        # Explicit retry and quality changes must still repaint the paused frame.
        self.page.locator('#ModernAnimationPlaybackRetry').click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        optics = self.page.locator('#ModernAnimationPlaybackOptics')
        optics.select_option('fast')
        expect(diag).to_contain_text('Requested optics: Fast if supported · Effective: Fast Preview', timeout=30000)
        optics.select_option('canvas-direct')
        expect(diag).to_contain_text('Requested optics: Canvas Direct', timeout=30000)
        storyboard = self.page.locator('#ModernAnimationStoryboard')
        expect(storyboard.locator('.modern-animation-storyboard-card')).to_have_count(9)
        refresh = storyboard.get_by_role('button', name='Capture selected keyframe thumbnail', exact=True)
        refresh.click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 20950)
        with self.page.expect_download() as download:
            storyboard.get_by_role('button', name='Export without thumbnails', exact=True).click()
        portable = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
        self.assertEqual(len(portable['animations']), 1)
        self.assertEqual(len(portable['animations'][0]['project']['keyframes']), 9)
        for section, action in (
            ('ModernAnimationFrameExportSection', 'Render PNG ZIP'),
            ('ModernAnimationVideoExportSection', 'Render video'),
        ):
            details = self.page.locator('#' + section)
            details.locator('summary').click()
            expect(details.get_by_role('button', name=action)).to_be_visible()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_animation_timeline_thumbnail_opens_preview_at_frame_and_edit_cancel_restores(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        library.locator('[data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        studio = self.page.locator('#ModernAnimationStudio')
        timeline = studio.locator('.modern-studio-keyframe')
        expect(timeline).to_have_count(9)
        expect(studio.locator('.modern-studio-preview-bar')).to_have_count(0)
        card = studio.locator('.modern-studio-filmstrip-item').nth(3)
        controls = card.locator('.modern-studio-card-actions')
        expect(controls.locator('button')).to_have_count(2)
        self.assertEqual(self.page.evaluate('''() => {
            const card=document.querySelectorAll('.modern-studio-filmstrip-item')[3];
            const info=card.querySelector('.modern-card-info-button').getBoundingClientRect();
            const controls=[...card.querySelectorAll('.modern-studio-card-icon')].map(b=>b.getBoundingClientRect());
            const remove=card.querySelector('.modern-card-delete').getBoundingClientRect();
            return controls.length===2 && info.right<=controls[0].left &&
                   controls[0].right<=controls[1].left && controls[1].right<=remove.left;
        }'''), True, 'Info, Properties, Edit and Remove must not overlap')
        card.get_by_role('button', name='Show details for').click()
        expect(self.page.get_by_role('dialog', name='Saved snapshot or animation details')).to_be_visible()
        self.page.get_by_role('button', name='Close details').click()
        controls.get_by_role('button', name='Properties for').click()
        expect(studio.get_by_label('Frame name')).to_have_value('04 · Low view, hidden spans')
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        before = self.page.evaluate("""() => ({
            mode: CurvatureModernApp.getMode(),
            height: CurvatureModernApp.getModel().Height,
            draft: JSON.stringify(CurvatureModernApp.getAnimationStudioDraft().draft),
            saved: localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY)
        })""")
        controls.get_by_role('button', name='Edit 04').click()
        banner = self.page.locator('#ModernKeyframeEditBanner')
        expect(banner).to_be_visible()
        expect(banner).to_contain_text('04 · Low view, hidden spans')
        expect(banner.get_by_role('button', name='Apply & Return')).to_be_enabled()
        expect(banner).to_contain_text('Animation Studio / Keyframe Editor')
        expect(banner).to_contain_text('Only camera controls can change')
        self.assertNotIn('camera.CameraEast',banner.inner_text())
        self.assertTrue(self.page.locator('body').evaluate(
            "(el) => el.classList.contains('modern-keyframe-edit-active')"))
        self.assertEqual(self.page.evaluate(
            "getComputedStyle(document.body).backgroundColor"),'rgb(240, 237, 250)')
        styles=banner.evaluate("""el => {
            const cancel=getComputedStyle(el.querySelector('.modern-keyframe-edit-cancel'));
            const apply=getComputedStyle(el.querySelector('.modern-keyframe-edit-apply'));
            return {cancelBackground:cancel.backgroundColor,applyBackground:apply.backgroundColor,
                cancelRadius:cancel.borderRadius,applyRadius:apply.borderRadius,
                cancelHeight:el.querySelector('.modern-keyframe-edit-cancel').getBoundingClientRect().height,
                applyHeight:el.querySelector('.modern-keyframe-edit-apply').getBoundingClientRect().height};
        }""")
        self.assertNotEqual(styles['cancelBackground'],styles['applyBackground'])
        self.assertEqual(styles['cancelRadius'],styles['applyRadius'])
        self.assertEqual(styles['cancelHeight'],styles['applyHeight'])
        self.assertFalse(self.page.locator('#ModernWorkspace').evaluate('(el) => el.inert'))
        expect(self.page.locator('#ModernHeight')).to_be_enabled()
        expect(self.page.locator('#ModernAtmosphere')).to_be_disabled()
        expect(self.page.locator('#ModernRender')).to_be_disabled()
        expected_mode = self.page.evaluate('''() =>
            CurvatureModernApp.getAnimationStudioDraft().draft.frames[3].experiment.display.mode''')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getWorkspaceMode()'), expected_mode)
        expect(self.page.locator('#ModernAnimationWorkspace')).to_be_hidden()
        old_height=self.page.evaluate('CurvatureModernApp.getModel().Height')
        self.page.locator('#ModernHeight').fill(str(old_height+2))
        self.page.locator('#ModernHeight').press('Tab')
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height === h',
                                    arg=old_height+2)
        self.page.wait_for_timeout(700)
        self.assertEqual(self.page.evaluate("""() =>
            localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY)"""), before['saved'])
        banner.get_by_role('button', name='Cancel & Return').click()
        expect(banner).to_have_count(0)
        self.assertFalse(self.page.locator('body').evaluate(
            "(el) => el.classList.contains('modern-keyframe-edit-active')"))
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getMode()'), before['mode'])
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getModel().Height'), before['height'])
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getAnimationStudioDraft().draft)"""), before['draft'])
        timeline.nth(3).click()
        expect(self.page.locator('#ModernAnimationPreviewView')).to_be_visible()
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback()?.positionMs > 0')
        position = self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs')
        expected = self.page.evaluate('''() => {
            const checkpoint=CurvatureModernApp.getAnimationStudioDraft();
            const frame=checkpoint.draft.frames[3];
            return CurvatureModernAnimationStudio.keyframeArrival(
                checkpoint.draft,CurvatureModernApp.getAnimationStudioProject(),frame.key);
        }''')
        self.assertEqual(position, expected, 'Preview must seek to the exact fourth-keyframe arrival')
        self.page.locator('#ModernAnimationViewEditor').click()
        expect(studio.locator('.modern-studio-keyframe').nth(3)).to_have_attribute('aria-pressed', 'true')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), position)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)


    def test_animation_keyframe_temporary_undo_redo_and_shortcuts(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        studio=self.page.locator('#ModernAnimationStudio')
        studio.locator('.modern-studio-filmstrip-item').nth(3).get_by_role(
            'button',name='Edit 04').click()
        banner=self.page.locator('#ModernKeyframeEditBanner')
        expect(banner).to_be_visible()
        draft_before=self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getAnimationStudioDraft().draft)""")
        undo=banner.get_by_role('button',name='Undo',exact=True)
        redo=banner.get_by_role('button',name='Redo',exact=True)
        expect(undo).to_be_disabled()
        expect(redo).to_be_disabled()
        self.page.locator('#ModernModelTabA').click()
        self.page.locator('#ModernModelTabB').click()
        expect(undo).to_be_disabled()  # navigation is not an edit
        before=self.page.evaluate('CurvatureModernApp.getModel().Height')
        self.page.locator('#ModernHeight').fill(str(before+3))
        self.page.locator('#ModernHeight').press('Tab')
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=before+3)
        expect(undo).to_be_enabled()
        expect(redo).to_be_disabled()
        expect(banner).to_contain_text('Unsaved changes')
        undo.click()
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=before)
        expect(redo).to_be_enabled()
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getAnimationStudioDraft().draft)"""),draft_before)
        redo.click()
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=before+3)
        # Undo via shortcut outside native input and then branch the history.
        redo.focus()
        self.page.keyboard.press('Control+z')
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=before)
        self.page.locator('#ModernHeight').fill(str(before+5))
        self.page.locator('#ModernHeight').press('Tab')
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=before+5)
        expect(redo).to_be_disabled()
        banner.get_by_role('button',name='Cancel & Return').click()
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getAnimationStudioDraft().draft)"""),draft_before)

    def test_animation_keyframe_edit_session_f5_recovers_undo_redo(self):
        self.open_modern()
        before_mode = self.page.evaluate('CurvatureModernApp.getMode()')
        before_height = self.page.evaluate('CurvatureModernApp.getModel().Height')
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        studio = self.page.locator('#ModernAnimationStudio')
        studio.locator('.modern-studio-filmstrip-item').nth(3).get_by_role(
            'button', name='Edit 04').click()
        expect(self.page.locator('#ModernKeyframeEditBanner')).to_be_visible()
        self.assertTrue(self.page.locator('body').evaluate(
            "(el) => el.classList.contains('modern-keyframe-edit-active')"))
        starting=self.page.evaluate('CurvatureModernApp.getModel().Height')
        self.page.locator('#ModernHeight').fill(str(starting+3))
        self.page.locator('#ModernHeight').press('Tab')
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=starting+3)
        self.page.locator('#ModernHeight').fill(str(starting+6))
        self.page.locator('#ModernHeight').press('Tab')
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=starting+6)
        banner=self.page.locator('#ModernKeyframeEditBanner')
        banner.get_by_role('button',name='Undo',exact=True).click()
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=starting+3)
        expect(banner.get_by_role('button',name='Redo',exact=True)).to_be_enabled()
        self.page.reload(wait_until='load')
        banner=self.page.locator('#ModernKeyframeEditBanner')
        try:
            expect(banner).to_be_visible(timeout=12000)
        except AssertionError:
            diagnostic=self.page.evaluate("""async () => {
                const key='curvature-modern-keyframe-edit-recovery-v1';
                const raw=sessionStorage.getItem(key);
                const saved=raw?JSON.parse(raw):null;
                const current=CurvatureModernApp.getAnimationStudioDraft();
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                const remote=saved&&c?CurvatureModernAnimationDraftAutosave.getWorkspace(
                    c,saved.session.projectId):null;
                const frame=current?.draft?.frames?.find(f=>f.key===saved?.session?.frameKey);
                return {stored:!!saved,tabId:saved?.tabId,
                    libraryId:saved?.libraryId,libraryRevision:saved?.libraryRevision,
                    projectId:saved?.session?.projectId,activeId:c?.activeId,
                    draftEqual:JSON.stringify(current?.draft)===saved?.draftAtEntry,
                    remoteEqual:JSON.stringify(remote?.draft)===saved?.draftAtEntry,
                    frameEqual:JSON.stringify(frame?.experiment)===JSON.stringify(saved?.session?.original),
                    appMode:CurvatureModernApp.getWorkspaceMode(),
                    message:document.getElementById('ModernAnimationDraftStatus')?.textContent,
                    view:CurvatureModernApp.getAnimationStudioView(),
                    url:location.href};
            }""")
            self.fail('F5 editor recovery failed: '+str(diagnostic))
        expect(banner).to_contain_text('Recovered unsaved keyframe edits')
        self.assertTrue(self.page.locator('body').evaluate(
            "(el) => el.classList.contains('modern-keyframe-edit-active')"))
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getModel().Height'),starting+3)
        banner.get_by_role('button',name='Redo',exact=True).click()
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=starting+6)
        banner.get_by_role('button',name='Cancel & Return').click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible(timeout=30000)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getMode()'), before_mode)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getModel().Height'), before_height)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.frames.length'), 9)
        self.assertIsNone(self.page.evaluate("""() =>
            sessionStorage.getItem('curvature-modern-keyframe-edit-recovery-v1')"""))

    def test_animation_keyframe_edit_back_forward_and_second_tab_isolation(self):
        self.open_modern()
        normal_height = self.page.evaluate('CurvatureModernApp.getModel().Height')
        normal_mode = self.page.evaluate('CurvatureModernApp.getMode()')
        self.open_animation()
        # Establish a same-document Library history entry before opening the
        # copied project. Back from Editor must stay within Studio.
        self.page.locator('#ModernAnimationViewLibrary').click()
        self.assertEqual(self.page.evaluate("""() =>
            new URL(location.href).searchParams.get('studioView')"""), 'library')
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        studio = self.page.locator('#ModernAnimationStudio')
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        expect(studio.locator('.modern-studio-filmstrip-item')).to_have_count(9)
        self.page.wait_for_function("""() =>
            new URL(location.href).searchParams.get('studioView') === 'editor'""")
        draft_before = self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getAnimationStudioDraft().draft)""")
        studio.locator('.modern-studio-filmstrip-item').nth(3).get_by_role(
            'button', name='Edit 04').click()
        expect(self.page.locator('#ModernKeyframeEditBanner')).to_be_visible()
        self.assertTrue(self.page.locator('.modern-share-actions').evaluate('(el) => el.inert'))
        self.assertTrue(self.page.locator('.modern-tabs').evaluate('(el) => el.inert'))
        self.assertTrue(self.page.locator('#ModernHistoryPanel').evaluate('(el) => el.inert'))

        # A fresh tab does not inherit any active editing session or transient
        # camera/physical preview from this page.
        other = self.context.new_page()
        try:
            response = other.goto(self.base_url, wait_until='load')
            self.assertEqual(response.status, 200)
            expect(other.locator('#ModernSceneTab')).to_be_visible()
            expect(other.locator('#ModernKeyframeEditBanner')).to_have_count(0)
            # Another tab may open directly in Animation per saved preferences.
            # Wait for physical-session startup, not a particular visible tab.
            other.wait_for_function("""() =>
                document.getElementById('ModernSceneTab').disabled === false""")
            self.assertEqual(other.evaluate('CurvatureModernApp.getModel().Height'), normal_height)
            self.assertEqual(other.evaluate('CurvatureModernApp.getMode()'), normal_mode)
        finally:
            other.close()

        # Back consumes the destination Studio route, rather than leaving the
        # live editor on a different page from the browser address.
        self.page.go_back()
        expect(self.page.locator('#ModernKeyframeEditBanner')).to_have_count(0)
        self.assertFalse(self.page.locator('.modern-share-actions').evaluate('(el) => el.inert'))
        self.assertFalse(self.page.locator('.modern-tabs').evaluate('(el) => el.inert'))
        expect(self.page.locator('#ModernAnimationLibraryView')).to_be_visible()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioView()'),
                         'library')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getModel().Height'), normal_height)
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getAnimationStudioDraft().draft)"""), draft_before)
        self.page.go_forward()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        expect(self.page.locator('#ModernKeyframeEditBanner')).to_have_count(0)


    def test_animation_keyframe_contract_locks_secondary_camera_and_compare_actions(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        studio=self.page.locator('#ModernAnimationStudio')
        expect(studio.locator('.modern-studio-filmstrip-item')).to_have_count(9)
        studio.locator('.modern-studio-filmstrip-item').nth(3).get_by_role(
            'button',name='Edit 04').click()
        expect(self.page.locator('#ModernKeyframeEditBanner')).to_be_visible()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getMode()'),'compare')
        for locked in ['ModernModelRadius','ModernModelCurvature','ModernAtmosphere',
                       'ModernViewAngle','ModernCameraAim',
                       'ModernResetPreset','ModernRender']:
            expect(self.page.locator('#'+locked)).to_be_disabled()
        expect(self.page.locator('#ModernModelTabA')).to_be_enabled()
        expect(self.page.locator('#ModernModelTabB')).to_be_enabled()
        self.page.locator('#ModernModelTabA').click()
        expect(self.page.locator('#ModernModelTabA')).to_have_attribute('aria-pressed','true')
        self.page.locator('#ModernModelTabB').click()
        expect(self.page.locator('#ModernModelTabB')).to_have_attribute('aria-pressed','true')
        expect(self.page.locator('#ModernPan')).to_be_enabled()
        self.assertEqual(self.page.locator('#ModernRender').evaluate(
            'el => getComputedStyle(el).cursor'),'not-allowed')
        self.assertLess(float(self.page.locator('#ModernRender').evaluate(
            'el => getComputedStyle(el).opacity')),0.8)
        pan=self.page.evaluate('CurvatureModernApp.getModel().Pan')
        # A disallowed programmatic DOM event must not bypass delegated locking.
        self.page.evaluate("""() => {
            const el=document.getElementById('ModernAtmosphere');
            el.value='vacuum';
            el.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
        }""")
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getModel().Pan'),pan)
        self.page.locator('#ModernPan').fill(str(pan+1))
        self.page.locator('#ModernPan').press('Tab')
        self.page.wait_for_function('p => Math.abs(CurvatureModernApp.getModel().Pan-p)<0.0001',
                                    arg=pan+1)
        expect(self.page.locator('#ModernModelRadius')).to_be_disabled()
        self.page.locator('#ModernKeyframeEditBanner').get_by_role(
            'button',name='Cancel & Return').click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        self.assertFalse(self.page.locator('.modern-share-actions').evaluate('(el) => el.inert'))


    def test_animation_camera_keyframe_mouse_rotation_apply_and_cancel(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        studio=self.page.locator('#ModernAnimationStudio')
        expect(studio.locator('.modern-studio-filmstrip-item')).to_have_count(9)
        studio.locator('.modern-studio-filmstrip-item').nth(3).get_by_role(
            'button', name='Edit 04').click()
        banner=self.page.locator('#ModernKeyframeEditBanner')
        expect(banner).to_be_visible()
        original=self.page.evaluate('CurvatureModernApp.getModel().Pan')
        canvas=self.page.locator('#ModernWorkspace canvas.modern-camera-draggable:visible').first
        box=canvas.bounding_box()
        self.assertIsNotNone(box)
        x=box['x']+box['width']*0.5
        y=box['y']+box['height']*0.5
        self.page.mouse.move(x,y)
        self.page.mouse.down()
        self.page.mouse.move(x+min(90,box['width']*0.2),y,steps=6)
        self.page.mouse.up()
        self.page.wait_for_function(
            'p => Math.abs(CurvatureModernApp.getModel().Pan-p)>0.0001',
            arg=original)
        changed=self.page.evaluate('CurvatureModernApp.getModel().Pan')
        undo=banner.get_by_role('button',name='Undo',exact=True)
        redo=banner.get_by_role('button',name='Redo',exact=True)
        expect(undo).to_be_enabled()
        undo.click()
        self.page.wait_for_function(
            'p => Math.abs(CurvatureModernApp.getModel().Pan-p)<0.0001',arg=original)
        expect(undo).to_be_disabled()  # a full drag is exactly one action
        redo.click()
        self.page.wait_for_function(
            'p => Math.abs(CurvatureModernApp.getModel().Pan-p)<0.0001',arg=changed)
        expect(self.page.locator('#ModernAtmosphere')).to_be_disabled()
        banner.get_by_role('button',name='Cancel & Return').click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        studio.locator('.modern-studio-filmstrip-item').nth(3).get_by_role(
            'button', name='Edit 04').click()
        self.page.wait_for_function(
            'p => Math.abs(CurvatureModernApp.getModel().Pan-p)<0.0001',
            arg=original)
        self.page.locator('#ModernKeyframeEditBanner').get_by_role(
            'button',name='Cancel & Return').click()


    def create_physical_keyframe_project(self, scope, channel, name):
        library = self.page.locator('#ModernAnimationLibrary')
        library.get_by_text('New project', exact=True).click()
        wizard = self.page.locator('#ModernAnimationProjectWizard')
        wizard.get_by_role('button', name='Physics Transition — one physical channel changes; camera stays fixed').click()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_role('button', name='Use current Scene/Compare as reference').click()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_role('button', name=scope+' · '+channel, exact=True).click()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_label('Include reference as first keyframe').check()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_label('Project name').fill(name)
        wizard.get_by_role('button', name='Create project').click()
        studio = self.page.locator('#ModernAnimationStudio')
        expect(studio.locator('.modern-studio-filmstrip-item')).to_have_count(1,timeout=30000)
        studio.locator('.modern-studio-filmstrip-item').get_by_role('button',name='Edit ',exact=False).click()
        expect(self.page.locator('#ModernKeyframeEditBanner')).to_be_visible()
        return studio

    def test_animation_keyframe_physical_scene_gradient_only(self):
        self.open_modern()
        self.page.locator('#ModernSettingsAtmosphere').click()
        self.page.locator('#ModernAtmosphere').select_option('temperature-lapse')
        self.open_animation()
        self.create_physical_keyframe_project('scene','Temperature gradient','CI Scene Gradient')
        expect(self.page.locator('#ModernTemperatureSceneGradient')).to_be_enabled()
        expect(self.page.locator('#ModernHeight')).to_be_disabled()
        expect(self.page.locator('#ModernRadiusKm')).to_be_disabled()
        initial = self.page.locator('#ModernTemperatureSceneGradient').input_value()
        proposed = -5.0 if float(initial)!=-5.0 else -4.0
        self.page.locator('#ModernTemperatureSceneGradient').fill(str(proposed))
        self.page.locator('#ModernTemperatureSceneGradient').press('Tab')
        self.page.wait_for_function("""p => Math.abs(
            CurvatureModernApp.getPhotoCalibrationScene().physics.temperatureProfile.gradientKPerKm-p)<0.001""",
            arg=proposed)
        # A numeric edit must not silently enable the unrelated surface controls.
        expect(self.page.locator('#ModernRadiusKm')).to_be_disabled()
        self.page.locator('#ModernKeyframeEditBanner').get_by_role(
            'button',name='Cancel & Return').click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        self.assertFalse(self.page.locator('.modern-tabs').evaluate('(el) => el.inert'))

    def test_animation_keyframe_physical_compare_a_curvature_only(self):
        self.open_modern()
        self.page.locator('#ModernCompareTab').click()
        self.open_animation()
        self.create_physical_keyframe_project('A','Earth curvature','CI Compare A curvature')
        expect(self.page.locator('#ModernModelCurvature')).to_be_enabled()
        expect(self.page.locator('#ModernModelTabA')).to_be_enabled()
        expect(self.page.locator('#ModernModelTabB')).to_be_enabled()
        expect(self.page.locator('#ModernHeight')).to_be_disabled()
        expect(self.page.locator('#ModernTemperatureCompareGradient')).to_be_disabled()
        prior = self.page.evaluate("""() => ({
            A: JSON.stringify(CurvatureModernApp.getCompareConfig().A),
            B: JSON.stringify(CurvatureModernApp.getCompareConfig().B)
        })""")
        self.page.locator('#ModernModelTabB').click()
        expect(self.page.locator('#ModernModelCurvature')).to_be_disabled()
        self.assertEqual(self.page.locator('#ModernModelCurvature').evaluate(
            'el => getComputedStyle(el).cursor'),'not-allowed')
        self.page.locator('#ModernModelCurvature').evaluate("""el => {
            el.value='235';el.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
        }""")
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getCompareConfig().B)"""),prior['B'])
        self.page.locator('#ModernModelTabA').click()
        expect(self.page.locator('#ModernModelCurvature')).to_be_enabled()
        self.page.locator('#ModernModelCurvature').evaluate("""el => {
            el.value='235';
            el.dispatchEvent(new Event('input',{bubbles:true,cancelable:true}));
            el.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
        }""")
        self.page.wait_for_function("""value =>
            JSON.stringify(CurvatureModernApp.getCompareConfig().A)!==value""",arg=prior['A'])
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getCompareConfig().B)"""),prior['B'])
        self.page.locator('#ModernKeyframeEditBanner').get_by_role(
            'button',name='Cancel & Return').click()
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getCompareConfig().A)"""),prior['A'])

    def test_animation_keyframe_physical_compare_b_curvature_only(self):
        self.open_modern()
        self.page.locator('#ModernCompareTab').click()
        self.open_animation()
        self.create_physical_keyframe_project('B','Earth curvature','CI Compare B curvature')
        expect(self.page.locator('#ModernModelCurvature')).to_be_enabled()
        expect(self.page.locator('#ModernHeight')).to_be_disabled()
        prior = self.page.evaluate("""() => ({
            A: JSON.stringify(CurvatureModernApp.getCompareConfig().A),
            B: JSON.stringify(CurvatureModernApp.getCompareConfig().B)
        })""")
        self.page.locator('#ModernModelTabA').click()
        expect(self.page.locator('#ModernModelCurvature')).to_be_disabled()
        self.page.locator('#ModernModelCurvature').evaluate("""el => {
            el.value='235';el.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
        }""")
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getCompareConfig().A)"""),prior['A'])
        self.page.locator('#ModernModelTabB').click()
        expect(self.page.locator('#ModernModelCurvature')).to_be_enabled()
        self.page.locator('#ModernModelCurvature').evaluate("""el => {
            el.value='235';
            el.dispatchEvent(new Event('input',{bubbles:true,cancelable:true}));
            el.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
        }""")
        self.page.wait_for_function("""value =>
            JSON.stringify(CurvatureModernApp.getCompareConfig().B)!==value""",arg=prior['B'])
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getCompareConfig().A)"""),prior['A'])
        self.page.locator('#ModernKeyframeEditBanner').get_by_role(
            'button',name='Cancel & Return').click()
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getCompareConfig().B)"""),prior['B'])


    def test_animation_keyframe_apply_one_frame_undo_redo_and_no_history_write(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        studio=self.page.locator('#ModernAnimationStudio')
        expect(studio.locator('.modern-studio-filmstrip-item')).to_have_count(9)
        before=self.page.evaluate("""async () => ({
            draft: CurvatureModernApp.getAnimationStudioDraft().draft,
            physical: localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY),
            history: (await CurvatureModernApp.getHistoryStore().list()).length
        })""")
        fourth=before['draft']['frames'][3]
        prior_height=fourth['experiment']['scene']['camera']['Height']
        studio.locator('.modern-studio-filmstrip-item').nth(3).get_by_role(
            'button',name='Edit 04').click()
        banner=self.page.locator('#ModernKeyframeEditBanner')
        expect(banner).to_be_visible()
        expect(banner.get_by_role('button',name='Apply & Return')).to_be_enabled()
        self.assertTrue(banner.get_attribute('data-workspace-id').startswith('project_'))
        self.page.locator('#ModernHeight').fill(str(prior_height+3))
        self.page.locator('#ModernHeight').press('Tab')
        self.page.wait_for_function('h => CurvatureModernApp.getModel().Height===h',
                                    arg=prior_height+3)
        banner.get_by_role('button',name='Apply & Return').click()
        expect(banner).to_have_count(0,timeout=30000)
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        after=self.page.evaluate("""async () => ({
            draft: CurvatureModernApp.getAnimationStudioDraft().draft,
            physical: localStorage.getItem(CurvatureModernExperimentState.STORAGE_KEY),
            history: (await CurvatureModernApp.getHistoryStore().list()).length
        })""")
        self.assertEqual(after['draft']['frames'][3]['experiment']['scene']['camera']['Height'],
                         prior_height+3)
        self.assertEqual(after['draft']['frames'][:3],before['draft']['frames'][:3])
        self.assertEqual(after['draft']['frames'][4:],before['draft']['frames'][4:])
        self.assertEqual(after['physical'],before['physical'])
        self.assertEqual(after['history'],before['history'])
        studio.locator('.modern-studio-edit-undo').first.click()
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernApp.getAnimationStudioDraft().draft.frames[3].experiment.scene.camera.Height"""),
            prior_height)
        studio.locator('.modern-studio-edit-redo').first.click()
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernApp.getAnimationStudioDraft().draft.frames[3].experiment.scene.camera.Height"""),
            prior_height+3)


    def test_animation_keyframe_apply_persists_in_library_and_survives_reload(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        studio=self.page.locator('#ModernAnimationStudio')
        expect(studio.locator('.modern-studio-filmstrip-item')).to_have_count(9)
        original=self.page.evaluate("""() =>
            CurvatureModernApp.getAnimationStudioDraft().draft.frames[3].experiment.scene.camera.Height""")
        studio.locator('.modern-studio-filmstrip-item').nth(3).get_by_role(
            'button',name='Edit 04').click()
        height=self.page.locator('#ModernHeight')
        height.fill(str(original+6))
        height.press('Tab')
        self.page.locator('#ModernKeyframeEditBanner').get_by_role(
            'button',name='Apply & Return').click()
        expect(self.page.locator('#ModernKeyframeEditBanner')).to_have_count(0,timeout=30000)
        self.page.locator('#ModernAnimationViewLibrary').click()
        self.page.locator('#ModernAnimationLibrary').get_by_text(
            'Save changes',exact=True).click()
        self.page.wait_for_function("""async expected => {
            const rows=await CurvatureModernAnimationLibrary.list(indexedDB);
            return rows.length===1 && rows[0].project.keyframes[3].value.Height===expected;
        }""",arg=original+6,timeout=30000)
        self.page.reload(wait_until='load')
        self.open_animation()
        self.page.locator('#ModernAnimationViewEditor').click()
        expect(self.page.locator('#ModernAnimationStudio .modern-studio-filmstrip-item')).to_have_count(9)
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernApp.getAnimationStudioDraft().draft.frames[3].experiment.scene.camera.Height"""),
            original+6)
        self.assertEqual(self.page.evaluate("""async () =>
            (await CurvatureModernAnimationLibrary.list(indexedDB))[0].project.keyframes[3].value.Height"""),
            original+6, 'persisted embedded value must survive F5 without History')

    def test_animation_keyframe_apply_rejects_stale_two_tab_workspace(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        studio=self.page.locator('#ModernAnimationStudio')
        expect(studio.locator('.modern-studio-filmstrip-item')).to_have_count(9)
        project_id=self.page.evaluate("""async () =>
            (await CurvatureModernAnimationLibrary.list(indexedDB))[0].id""")
        workspace_id='project_'+project_id
        self.page.wait_for_function("""async id => {
            const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
            return c?.workspaces.some(w=>w.id===id);
        }""",arg=workspace_id,timeout=30000)
        unchanged=self.page.evaluate("""() =>
            CurvatureModernApp.getAnimationStudioDraft().draft.frames[3].experiment.scene.camera.Height""")
        studio.locator('.modern-studio-filmstrip-item').nth(3).get_by_role(
            'button',name='Edit 04').click()
        height=self.page.locator('#ModernHeight')
        height.fill(str(unchanged+8))
        height.press('Tab')
        self.page.wait_for_function('v => CurvatureModernApp.getModel().Height===v',arg=unchanged+8)

        other=self.context.new_page()
        try:
            response=other.goto(self.base_url,wait_until='load')
            self.assertEqual(response.status,200)
            other.locator('#ModernAnimationTab').click()
            expect(other.locator('#ModernAnimationLibrary')).to_be_visible()
            other.locator('#ModernAnimationViewLibrary').click()
            card=other.locator('#ModernAnimationLibrary [data-animation-id="'+project_id+'"]')
            expect(card).to_be_visible()
            card.get_by_role('button',name='Open saved animation').click()
            other.locator('#ModernAnimationViewEditor').click()
            other_studio=other.locator('#ModernAnimationStudio')
            expect(other_studio.locator('.modern-studio-filmstrip-item')).to_have_count(9)
            other_studio.get_by_role('button',name='Inspect project settings').click()
            name=other_studio.get_by_label('Project name')
            name.fill('Competing tab project edit')
            name.press('Tab')
            other.wait_for_function("""async id => {
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                return c?.workspaces.some(w=>w.id===id &&
                    w.checkpoint.draft.name==='Competing tab project edit');
            }""",arg=workspace_id,timeout=30000)
            other.wait_for_timeout(700)  # flush stale debounces before comparing

            banner=self.page.locator('#ModernKeyframeEditBanner')
            self.assertEqual(banner.get_attribute('data-workspace-id'),workspace_id,
                             'temporary keyframe editor must share the edited workspace')
            remote_before=self.page.evaluate("""async id => {
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                const w=c.workspaces.find(w=>w.id===id);
                return {id,remoteName:w?.checkpoint?.draft?.name,
                    localName:CurvatureModernApp.getAnimationStudioDraft().draft.name};
            }""",workspace_id)
            self.assertEqual(remote_before['remoteName'],'Competing tab project edit',
                             'hidden keyframe session must not replay a stale autosave')
            self.assertNotEqual(remote_before['localName'],remote_before['remoteName'])
            banner.get_by_role('button',name='Apply & Return').click()
            self.page.wait_for_timeout(1100)
            if banner.count()==0:
                after=self.page.evaluate("""async id => {
                    const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                    return {remoteName:c.workspaces.find(w=>w.id===id)?.checkpoint?.draft?.name,
                        localName:CurvatureModernApp.getAnimationStudioDraft().draft.name,
                        currentView:CurvatureModernApp.getAnimationStudioView()};
                }""",workspace_id)
                self.fail('Stale keyframe Apply unexpectedly returned: '+str({
                    'before':remote_before,'after':after}))
            expect(banner).to_contain_text('Apply blocked',timeout=30000)
            expect(banner).to_contain_text('changed in another tab')
            self.assertEqual(self.page.evaluate('CurvatureModernApp.getModel().Height'),
                             unchanged+8, 'a blocked Apply retains the candidate for Cancel')
            self.assertEqual(self.page.evaluate("""() =>
                CurvatureModernApp.getAnimationStudioDraft().draft.frames[3].experiment.scene.camera.Height"""),
                unchanged)
            self.assertEqual(other.evaluate("""() =>
                CurvatureModernApp.getAnimationStudioDraft().draft.name"""),
                'Competing tab project edit')
            remote=other.evaluate("""async id => {
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                const entry=c.workspaces.find(w=>w.id===id);
                return {name:entry.checkpoint.draft.name,
                    height:entry.checkpoint.draft.frames[3].experiment.scene.camera.Height};
            }""",workspace_id)
            self.assertEqual(remote['name'],'Competing tab project edit')
            self.assertEqual(remote['height'],unchanged)
        finally:
            other.close()
        self.page.locator('#ModernKeyframeEditBanner').get_by_role(
            'button',name='Cancel & Return').click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()


    def test_animation_keyframe_apply_compare_b_curvature_preserves_a_and_undo(self):
        self.open_modern()
        self.page.locator('#ModernCompareTab').click()
        self.open_animation()
        studio=self.create_physical_keyframe_project(
            'B','Earth curvature','CI Compare B Apply')
        before=self.page.evaluate("""() => {
            const f=CurvatureModernApp.getAnimationStudioDraft().draft.frames[0];
            return {A:JSON.stringify(f.experiment.compare.A),
                    B:JSON.stringify(f.experiment.compare.B)};
        }""")
        slider=self.page.locator('#ModernModelCurvature')
        expect(slider).to_be_enabled()
        slider.evaluate("""el => {
            el.value='235';
            el.dispatchEvent(new Event('input',{bubbles:true,cancelable:true}));
            el.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
        }""")
        self.page.wait_for_function("""old =>
            JSON.stringify(CurvatureModernApp.getCompareConfig().B)!==old""",arg=before['B'])
        self.page.locator('#ModernKeyframeEditBanner').get_by_role(
            'button',name='Apply & Return').click()
        expect(self.page.locator('#ModernKeyframeEditBanner')).to_have_count(0,timeout=30000)
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        changed=self.page.evaluate("""() => {
            const f=CurvatureModernApp.getAnimationStudioDraft().draft.frames[0];
            return {A:JSON.stringify(f.experiment.compare.A),
                    B:JSON.stringify(f.experiment.compare.B)};
        }""")
        self.assertEqual(changed['A'],before['A'])
        self.assertNotEqual(changed['B'],before['B'])
        studio.locator('.modern-studio-edit-undo').first.click()
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getAnimationStudioDraft().draft.frames[0].experiment.compare.B)"""),
            before['B'])
        studio.locator('.modern-studio-edit-redo').first.click()
        self.assertEqual(self.page.evaluate("""() =>
            JSON.stringify(CurvatureModernApp.getAnimationStudioDraft().draft.frames[0].experiment.compare.B)"""),
            changed['B'])

    def test_animation_editor_timeline_inspector_and_responsive_layout(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        library.locator('[data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        studio = self.page.locator('#ModernAnimationStudio')
        timeline = studio.locator('.modern-studio-timeline-pane')
        strip = timeline.locator('.modern-studio-keyframe')
        inspector = studio.locator('.modern-studio-inspector-pane')
        expect(strip).to_have_count(9)
        expect(inspector.locator('.modern-studio-frame-panel')).to_be_visible()
        expect(inspector.get_by_role('button', name='Inspect selected keyframe')).to_have_attribute(
            'aria-pressed', 'true')
        layout = self.page.evaluate("""() => {
            const t=document.querySelector('.modern-studio-timeline-pane').getBoundingClientRect();
            const i=document.querySelector('.modern-studio-inspector-pane').getBoundingClientRect();
            return {timelineTop:t.top,inspectorTop:i.top,timelineRight:t.right,inspectorLeft:i.left};
        }""")
        self.assertLess(abs(layout['timelineTop'] - layout['inspectorTop']), 12)
        self.assertLessEqual(layout['timelineRight'], layout['inspectorLeft'])

        selected_name = studio.get_by_label('Frame name')
        selected_name.fill('Stage 3 editable keyframe')
        inspector.get_by_role('button', name='Inspect project settings').click()
        expect(inspector.locator('.modern-studio-project-panel')).to_be_visible()
        expect(timeline).to_be_visible()
        studio.get_by_label('Project name').fill('Stage 3 project settings')
        inspector.get_by_role('button', name='Inspect selected keyframe').click()
        expect(studio.get_by_label('Frame name')).to_have_value('Stage 3 editable keyframe')
        self.assertEqual(self.page.evaluate(
            "CurvatureModernApp.getAnimationStudioDraft().draft.name"), 'Stage 3 project settings')

        self.page.set_viewport_size({'width': 700, 'height': 850})
        expect(strip).to_have_count(9)
        narrow = self.page.evaluate("""() => {
            const t=document.querySelector('.modern-studio-timeline-pane').getBoundingClientRect();
            const i=document.querySelector('.modern-studio-inspector-pane').getBoundingClientRect();
            return {timelineTop:t.top,inspectorTop:i.top};
        }""")
        self.assertGreater(narrow['inspectorTop'], narrow['timelineTop'])
        studio.locator('.modern-studio-card-actions').nth(1).get_by_role('button', name='Properties for').click()
        expect(inspector.locator('.modern-studio-frame-panel')).to_be_visible()
        expect(strip.nth(1)).to_have_attribute('aria-pressed', 'true')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)


    def test_animation_stage5_two_tabs_divergent_drafts_are_forked_and_survive_reload(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text(
            'Create copy', exact=True).click()
        studio = self.page.locator('#ModernAnimationStudio')
        library = self.page.locator('#ModernAnimationLibrary')
        expect(studio).to_be_visible()
        self.page.wait_for_function("""async () =>
            (await CurvatureModernAnimationLibrary.list(indexedDB)).length === 1
        """, timeout=30000)
        project_id = self.page.evaluate("""async () => {
            const saved = await CurvatureModernAnimationLibrary.list(indexedDB);
            return saved.length === 1 ? saved[0].id : null;
        }""")
        self.assertIsNotNone(project_id)
        workspace_id = 'project_' + project_id
        self.page.wait_for_function("""async id => {
            const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
            return c?.workspaces.some(w => w.id===id);
        }""", arg=workspace_id, timeout=30000)

        other = self.context.new_page()
        other_errors = []
        other.on('pageerror', lambda err: other_errors.append(str(err)))
        try:
            response = other.goto(self.base_url, wait_until='load')
            self.assertEqual(response.status, 200)
            other.locator('#ModernAnimationTab').click()
            expect(other.locator('#ModernAnimationLibrary')).to_be_visible()
            other.locator('#ModernAnimationViewLibrary').click()
            card = other.locator('#ModernAnimationLibrary [data-animation-id="' + project_id + '"]')
            expect(card).to_be_visible()
            card.get_by_role('button', name='Open saved animation').click()
            # If recovery already owns this project, Open is intentionally a
            # no-op; selecting Editor is still a separate navigation action.
            other.locator('#ModernAnimationViewEditor').click()
            other_studio = other.locator('#ModernAnimationStudio')
            expect(other_studio).to_be_visible()
            original = studio.locator('.modern-studio-header').inner_text()
            self.assertIn('Working draft', original)
            initial = self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name')
            self.assertEqual(other.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name'),
                             initial)

            # Both tabs now have the same baseline. Write A first, with B
            # intentionally keeping its old optimistic concurrency baseline.
            studio.get_by_role('button', name='Inspect project settings').click()
            name_a = studio.get_by_label('Project name')
            name_a.fill('Stage 5 protected change A')
            name_a.press('Tab')
            self.page.wait_for_function("""async id => {
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                return c?.workspaces.some(w => w.id===id &&
                    w.checkpoint.draft.name==='Stage 5 protected change A');
            }""", arg=workspace_id, timeout=30000)
            self.assertEqual(other.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name'),
                             initial)

            other_studio.get_by_role('button', name='Inspect project settings').click()
            name_b = other_studio.get_by_label('Project name')
            name_b.fill('Stage 5 protected change B')
            name_b.press('Tab')
            other.wait_for_function("""async id => {
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                return c && c.workspaces.some(w => w.id===id &&
                    w.checkpoint.draft.name==='Stage 5 protected change A') &&
                    c.workspaces.some(w => w.id!==id && w.id.startsWith('draft_') &&
                    w.checkpoint.draft.name==='Stage 5 protected change B');
            }""", arg=workspace_id, timeout=30000)
            # Give any previously queued 450 ms autosave an opportunity to
            # finish. The durable state must remain stable after A/B fork.
            other.wait_for_timeout(700)
            names = other.evaluate("""async () => {
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                return c.workspaces.map(w => [w.id,w.checkpoint.draft.name,w.checkpoint.savedAt]);
            }""")
            diagnostic = {'remote': names,
                'A_live': self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name'),
                'B_live': other.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name'),
                'A_status': self.page.locator('#ModernPersistenceStatus').inner_text(),
                'B_status': other.locator('#ModernPersistenceStatus').inner_text()}
            self.assertEqual(sum(1 for _, value, _ in names if value=='Stage 5 protected change A'), 1,
                             str(diagnostic))
            self.assertEqual(sum(1 for _, value, _ in names if value=='Stage 5 protected change B'), 1)
            self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name'),
                             'Stage 5 protected change A')
            self.assertEqual(other.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name'),
                             'Stage 5 protected change B')

            # Reload must not manufacture additional same-content recovery forks.
            count_before = len(names)
            for _ in range(2):
                other.reload(wait_until='load')
                expect(other.locator('#ModernAnimationWorkspace')).to_be_visible()
                expect(other.locator('#ModernAnimationEditorView')).to_be_visible()
                self.assertEqual(other.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name'),
                                 'Stage 5 protected change B',
                                 'the divergent tab must restore its own active recovery fork')
                other.wait_for_function("""async () => {
                    const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                    return c && c.workspaces.some(w => w.checkpoint.draft.name==='Stage 5 protected change A')
                       && c.workspaces.some(w => w.checkpoint.draft.name==='Stage 5 protected change B');
                }""", timeout=30000)
            stable = other.evaluate("""async () => {
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                return c.workspaces.map(w => w.checkpoint.draft.name);
            }""")
            self.assertEqual(len(stable), count_before,
                             'reloading a conflict must not multiply recovery drafts')
            self.assertEqual(stable.count('Stage 5 protected change A'), 1)
            self.assertEqual(stable.count('Stage 5 protected change B'), 1)

            # A recovered fork remains writable after reload. A fresh edit
            # belongs only to B's independent draft, never to A or Library.
            other_studio = other.locator('#ModernAnimationStudio')
            other_studio.get_by_role('button', name='Inspect project settings').click()
            followup = other_studio.get_by_label('Project name')
            followup.fill('Stage 5 follow-up on recovered B')
            followup.press('Tab')
            other.wait_for_function("""async () => {
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                return c && c.workspaces.some(w=>w.checkpoint.draft.name==='Stage 5 protected change A')
                  && c.workspaces.some(w=>w.id.startsWith('draft_') &&
                      w.checkpoint.draft.name==='Stage 5 follow-up on recovered B');
            }""", timeout=30000)
            # Inspect settled durable/session identities, not a transient
            # successful read that a later queued writer could still undo.
            other.wait_for_timeout(800)
            after = other.evaluate("""async () => {
                const api=CurvatureModernAnimationDraftAutosave;
                const c=await api.readCollection(indexedDB);
                const session=api.workspaceSessionId(sessionStorage,crypto,window);
                const local=localStorage.getItem(api.SESSION_LOCAL_PREFIX+session);
                const backup=local?JSON.parse(local):null;
                return {
                  active:c.activeId,savedAt:c.savedAt,
                  workspaces:c.workspaces.map(w=>({id:w.id,name:w.checkpoint.draft.name,
                      savedAt:w.checkpoint.savedAt})),
                  localActive:backup?.activeId,
                  localWorkspaces:backup?.workspaces.map(w=>({id:w.id,name:w.checkpoint.draft.name}))
                };
            }""")
            recovered = [w['name'] for w in after['workspaces']]
            self.assertEqual(len(recovered), count_before, str(after))
            self.assertEqual(recovered.count('Stage 5 protected change A'), 1, str(after))
            self.assertEqual(recovered.count('Stage 5 follow-up on recovered B'), 1, str(after))
            self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name'),
                             'Stage 5 protected change A')
            other.reload(wait_until='load')
            expect(other.locator('#ModernAnimationEditorView')).to_be_visible()
            self.assertEqual(other.evaluate('CurvatureModernApp.getAnimationStudioDraft().draft.name'),
                             'Stage 5 follow-up on recovered B',
                             'later edits to the recovery fork must themselves survive F5')
            other.wait_for_function("""async () => {
                const c=await CurvatureModernAnimationDraftAutosave.readCollection(indexedDB);
                return c && c.workspaces.filter(w=>w.checkpoint.draft.name==='Stage 5 protected change A').length===1
                    && c.workspaces.filter(w=>w.checkpoint.draft.name==='Stage 5 follow-up on recovered B').length===1;
            }""", timeout=30000)
            self.assertEqual(other_errors, [])
            self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)
        finally:
            other.close()

    def test_animation_stage5_maximum_200_keyframes_import_scroll_and_recovery(self):
        self.open_modern()
        self.open_animation()
        # Exercise the supported upper bound through the public import path,
        # not by bypassing the app's private editor state.
        wire = self.page.evaluate("""() => {
            const base=structuredClone(CurvatureModernDemoCatalog.load().find(d => d.id==='soundly').project);
            const template=base.keyframes.map(frame => structuredClone(frame));
            base.id='stage5_large_timeline';
            base.name='Stage 5 maximum timeline';
            base.keyframes=Array.from({length:200},(_,i) => {
                const frame=structuredClone(template[i%template.length]);
                frame.sourceSnapshotId=null;
                frame.name='Long timeline frame '+String(i+1).padStart(3,'0');
                frame.travelMs=i===0?0:200;
                frame.holdMs=0;
                return frame;
            });
            return JSON.stringify(CurvatureModernAnimationProject.validate(base));
        }""")
        library = self.page.locator('#ModernAnimationLibrary')
        library.get_by_label('Import animation JSON file').set_input_files({
            'name':'large-timeline.json', 'mimeType':'application/json',
            'buffer':wire.encode('utf-8')})
        expect(library.locator('[data-animation-id]')).to_have_count(1, timeout=30000)
        library.locator('[data-animation-id]').get_by_role(
            'button', name='Open saved animation').click()
        studio = self.page.locator('#ModernAnimationStudio')
        cards = studio.locator('.modern-studio-keyframe')
        expect(cards).to_have_count(200, timeout=30000)
        strip = studio.locator('.modern-studio-filmstrip')
        self.assertGreater(strip.evaluate('el => el.scrollWidth / el.clientWidth'), 3)
        last = studio.locator('.modern-studio-filmstrip-item').nth(199)
        last.get_by_role('button', name='Properties for').focus()
        last.get_by_role('button', name='Properties for').press('Enter')
        expect(cards.nth(199)).to_have_attribute('aria-pressed', 'true')
        expect(studio.locator('.modern-studio-selected-heading')).to_contain_text('200 / 200')
        start = strip.evaluate('el => el.scrollLeft')
        self.assertGreater(start, 1000)
        old_keys = self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)')
        studio.get_by_role('button', name='Move animation frame 200 earlier').click()
        moved = self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)')
        self.assertEqual(moved[198], old_keys[199])
        self.assertEqual(moved[199], old_keys[198])
        self.assertAlmostEqual(strip.evaluate('el => el.scrollLeft'), start, delta=3)
        studio.locator('.modern-studio-edit-undo').first.click()
        self.assertEqual(self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)'), old_keys)
        studio.locator('.modern-studio-edit-redo').first.click()
        self.assertEqual(self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)'), moved)

        self.page.wait_for_timeout(750)
        self.page.reload(wait_until='load')
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        expect(studio.locator('.modern-studio-keyframe')).to_have_count(200, timeout=30000)
        self.assertEqual(self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)'), moved)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().selectedKey'),
                         old_keys[199])
        self.assertEqual(self.page.evaluate("""async () => {
            const saved=await CurvatureModernAnimationLibrary.list(indexedDB);
            return saved.length===1 ? saved[0].project.keyframes.length : -1;
        }"""), 200, 'draft reordering must not mutate the original Library project')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_animation_stage5_end_to_end_narrow_history_and_state_recovery(self):
        self.open_modern()
        self.open_animation()
        demo = self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]')
        demo.get_by_text('Create copy', exact=True).click()
        studio = self.page.locator('#ModernAnimationStudio')
        editor = self.page.locator('#ModernAnimationViewEditor')
        preview = self.page.locator('#ModernAnimationViewPreview')
        library = self.page.locator('#ModernAnimationViewLibrary')
        filmstrip = studio.locator('.modern-studio-filmstrip')
        inspector = studio.locator('.modern-studio-inspector-pane')
        expect(studio.locator('.modern-studio-keyframe')).to_have_count(9)

        self.page.set_viewport_size({'width': 390, 'height': 780})
        expect(filmstrip).to_be_visible()
        expect(inspector).to_be_visible()
        position = self.page.evaluate("""() => {
            const left=document.querySelector('.modern-studio-timeline-pane').getBoundingClientRect();
            const right=document.querySelector('.modern-studio-inspector-pane').getBoundingClientRect();
            return {left: left.top, right: right.top,
              bodyWidth: document.documentElement.scrollWidth,
              viewportWidth: window.innerWidth};
        }""")
        self.assertGreater(position['right'], position['left'],
                           'narrow layout stacks Inspector after the timeline')
        self.assertLessEqual(position['bodyWidth'], position['viewportWidth'] + 3,
                             'narrow mode tabs and Studio must not create page-wide scrolling')
        self.assertLessEqual(self.page.locator('#ModernDemosTab').evaluate(
            'el => el.getBoundingClientRect().right'), 393,
            'Demos tab must stay inside the 390 px viewport')

        studio.get_by_role('button', name='Open saved experiments to select animation keyframes').click()
        picker = self.page.locator('.modern-studio-picker-head')
        expect(picker.get_by_text('Snapshot Picker')).to_be_visible()
        self.assertTrue(self.page.locator('#ModernAnimationWorkspace').evaluate(
            "el => el.classList.contains('has-snapshot-picker')"))
        picker.get_by_role('button', name='Close Snapshot Picker').click()
        expect(picker).to_have_count(0)
        expect(studio.locator('.modern-studio-keyframe')).to_have_count(9)

        card = studio.locator('.modern-studio-filmstrip-item').nth(3)
        card.get_by_role('button', name='Properties for').click()
        frame = studio.get_by_label('Frame name')
        frame.fill('Stage 5 selected camera position')
        frame.press('Tab')
        key = self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().selectedKey')
        card = studio.locator('.modern-studio-filmstrip-item').nth(3)
        card.get_by_role('button', name='Edit 04').click()
        expect(self.page.locator('#ModernAnimationStudioMessage')).to_contain_text('coming soon')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().selectedKey'), key)
        card.locator('.modern-studio-keyframe').click()
        expect(self.page.locator('#ModernAnimationPreviewView')).to_be_visible()
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback()?.positionMs === 20950')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 20950)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().selectedKey'), key)

        editor.click()
        expect(studio.get_by_label('Frame name')).to_have_value('Stage 5 selected camera position')
        expect(studio.locator('.modern-studio-keyframe').nth(3)).to_have_attribute('aria-pressed', 'true')
        library.click()
        expect(self.page.locator('#ModernAnimationLibraryView')).to_be_visible()
        editor.click()
        expect(studio.get_by_label('Frame name')).to_have_value('Stage 5 selected camera position')
        self.page.wait_for_timeout(750)
        self.page.reload(wait_until='load')
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        expect(studio.get_by_label('Frame name')).to_have_value('Stage 5 selected camera position')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioDraft().selectedKey'), key)
        expect(studio.locator('.modern-studio-keyframe')).to_have_count(9)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_animation_editor_undo_redo_scroll_and_persistence_after_reorder(self):
        self.open_modern()
        self.open_animation()
        demo = self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]')
        demo.get_by_text('Create copy', exact=True).click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        studio = self.page.locator('#ModernAnimationStudio')
        strip = studio.locator('.modern-studio-filmstrip')
        cards = strip.locator('.modern-studio-keyframe')
        expect(cards).to_have_count(9)
        cards.nth(4).click()
        original = self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)')
        strip.evaluate('(el) => { el.scrollLeft = 260; }')
        scroll_before = strip.evaluate('(el) => el.scrollLeft')
        self.assertGreater(scroll_before, 0)
        studio.get_by_role('button', name='Move animation frame 5 earlier').click()
        moved = self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)')
        self.assertEqual(moved[3], original[4])
        self.assertEqual(moved[4], original[3])
        self.assertAlmostEqual(strip.evaluate('(el) => el.scrollLeft'), scroll_before, delta=2)
        expect(cards.nth(3)).to_have_attribute('aria-pressed', 'true')
        studio.locator('.modern-studio-edit-undo').first.click()
        self.assertEqual(self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)'), original)
        studio.locator('.modern-studio-edit-redo').first.click()
        self.assertEqual(self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)'), moved)

        studio.get_by_role('button', name='Inspect project settings').click()
        expect(strip).to_be_visible()
        name = studio.get_by_label('Project name')
        name.fill('Reordered timeline checkpoint')
        name.press('Tab')
        self.page.wait_for_timeout(750)
        self.page.reload(wait_until='load')
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        self.assertEqual(self.page.evaluate(
            'CurvatureModernApp.getAnimationStudioDraft().draft.frames.map(f => f.key)'), moved)
        studio.get_by_role('button', name='Inspect project settings').click()
        expect(studio.get_by_label('Project name')).to_have_value('Reordered timeline checkpoint')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)


    def test_animation_editor_sequence_disclosure_retains_open_state(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationViewEditor').click()
        studio = self.page.locator('#ModernAnimationStudio')
        inspector = studio.locator('.modern-studio-project-panel')
        expect(inspector).to_be_visible()
        disclosure = inspector.locator('.modern-studio-sequences-disclosure')
        expect(disclosure).to_be_visible()
        expect(disclosure).not_to_have_attribute('open', '')
        disclosure.locator('summary').click()
        expect(disclosure).to_have_attribute('open', '')
        # A valid project field commit rerenders the Studio, but should not
        # collapse the user's open compatibility choices.
        name = inspector.get_by_label('Project name')
        name.fill('Sequence inspector disclosure')
        name.press('Tab')
        expect(disclosure).to_have_attribute('open', '')
        expect(studio.locator('.modern-studio-filmstrip')).to_be_visible()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)


    def test_animation_studio_views_share_draft_and_playback(self):
        self.open_modern()
        self.open_animation()
        library_view = self.page.locator('#ModernAnimationLibraryView')
        editor_view = self.page.locator('#ModernAnimationEditorView')
        preview_view = self.page.locator('#ModernAnimationPreviewView')
        library_tab = self.page.locator('#ModernAnimationViewLibrary')
        editor_tab = self.page.locator('#ModernAnimationViewEditor')
        preview_tab = self.page.locator('#ModernAnimationViewPreview')
        expect(library_view).to_be_visible()
        expect(editor_view).to_be_hidden()
        expect(preview_view).to_be_hidden()
        expect(library_tab).to_have_attribute('aria-selected', 'true')
        editor_tab.click()
        editor = self.page.locator('#ModernAnimationStudio')
        editor.get_by_label('Project name').fill('View navigation survives')
        library_tab.click()
        editor_tab.click()
        expect(editor.get_by_label('Project name')).to_have_value('View navigation survives')
        editor_tab.focus()
        self.page.keyboard.press('ArrowRight')
        expect(preview_tab).to_have_attribute('aria-selected', 'true')
        expect(self.page.locator('#ModernAnimationPreviewEmpty')).to_contain_text('at least two compatible keyframes')
        library_tab.click()
        demo = self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]')
        demo.get_by_text('Open demo', exact=True).click()
        expect(preview_view).to_be_visible()
        expect(self.page.locator('#ModernAnimationPlaybackStage')).to_be_visible()
        seek = self.page.locator('#ModernAnimationPlaybackSeek')
        seek.evaluate("el => {el.value=400;el.dispatchEvent(new Event('input',{bubbles:true}));}")
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback().positionMs > 20000')
        position = self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs')
        editor_tab.click()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), position)
        preview_tab.click()
        expect(preview_view).to_be_visible()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), position)
        self.page.locator('#ModernAnimationPlaybackPlay').click()
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback().playing')
        editor_tab.click()
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        preview_tab.click()
        expect(preview_view).to_be_visible()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_navigation_and_studio_bootstrap(self):
        self.open_modern()
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.open_animation()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_calibration_origin_session_and_preset_recovery(self):
        self.open_modern()
        project = json.loads((ROOT/'demos/modern/soundly.json').read_text(encoding='utf-8'))['animations'][0]['project']
        link = self.page.evaluate("""project => {
            const codec=CurvatureModernExperimentState, e=codec.validate(project.baseExperiment);
            e.display.mode='scene';e.scene.preset='custom';e.scene.resetPreset='pontchartrain';
            e.scene.objects.NObjects=[1,0];
            const digest='a'.repeat(64);
            e.calibrationOrigin={version:1,target:'B',resultId:'calibration-result-v1-'+digest,
                resultDigest:digest,photo:{version:1,sha256:'b'.repeat(64),width:1176,height:791},
                baselineCamera:{Height:42.8,FocalLengthField:1996,Pan:.61,Nick:-.29,Roll:-.11,
                    CameraEast:-50.75,CameraNorth:-9.42,viewcenterHorizon:3},
                historicalFit:{method:'canvas-direct',status:'stalled',fitCount:14,validationCount:0,
                    rmsPx:6.82,weightedRmsPx:6.82,initialRmsPx:314.76}};
            const a=codec.validate(e), ordinary=structuredClone(a);delete ordinary.calibrationOrigin;
            for(const side of ['Scene','A','B']){
                if(CurvatureModernExperimentThumbnail.viewKey(a,side)!==CurvatureModernExperimentThumbnail.viewKey(ordinary,side))
                    throw Error('Origin changed thumbnail view identity');
            }
            return codec.urlWithExperiment(location.href,a);
        }""", project)
        self.page.goto(link, wait_until='load')
        preset=self.page.locator('#ModernPreset')
        expect(preset).to_have_value('custom', timeout=30000)
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed','true')
        self.page.wait_for_function("""async () => {
            const saved=await CurvatureModernSessionAutosave.read(indexedDB);
            return saved?.experiment?.display.mode==='compare'&&saved.experiment.calibrationOrigin?.target==='B';
        }""", timeout=30000)
        self.page.reload(wait_until='load')
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed','true')
        self.page.locator('#ModernSceneTab').click()
        expect(preset).to_be_enabled(timeout=30000)
        preset.select_option('chicago')
        expect(preset).to_have_value('chicago', timeout=30000)
        self.page.wait_for_function("""async () => {
            const saved=await CurvatureModernSessionAutosave.read(indexedDB);
            return saved?.experiment?.scene.preset==='chicago'&&!saved.experiment.calibrationOrigin;
        }""", timeout=30000)
        self.page.locator('#ModernPreviousExperiment').click()
        expect(preset).to_have_value('custom', timeout=30000)
        self.page.wait_for_function("""async () => {
            const saved=await CurvatureModernSessionAutosave.read(indexedDB);
            return saved?.experiment?.scene.preset==='custom'&&saved.experiment.calibrationOrigin?.target==='B';
        }""", timeout=30000)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_chicago_preset_compare_and_history_return(self):
        self.open_modern()
        preset = self.page.locator('#ModernPreset')
        expect(preset).to_have_value('pontchartrain')
        preset.select_option('chicago')
        expect(preset).to_have_value('chicago', timeout=30000)
        expect(self.page.locator('#ModernSceneTitle')).to_contain_text('Chicago Skyline')
        self.assertEqual(self.page.evaluate('''() => ({
            types: window.CurvatureModernApp.getModel().ObjType,
            counts: window.CurvatureModernApp.getModel().NObjects,
            atmosphere: document.getElementById('ModernAtmosphere').value,
        })'''), {'types': [4, 3], 'counts': [6, 0], 'atmosphere': 'standard'})
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernPreviousExperiment').click()
        expect(preset).to_have_value('pontchartrain', timeout=30000)
        self.assertEqual(self.page.evaluate('window.CurvatureModernApp.getModel().ObjType'), [3, 3])
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_causeway_preset_and_compare_return(self):
        self.open_modern()
        preset = self.page.locator('#ModernPreset')
        preset.select_option('causeway')
        expect(preset).to_have_value('causeway', timeout=30000)
        expect(self.page.locator('#ModernSceneTitle')).to_contain_text('Pontchartrain Causeway')
        self.assertEqual(self.page.evaluate("""() => ({
            types: window.CurvatureModernApp.getModel().ObjType,
            counts: window.CurvatureModernApp.getModel().NObjects,
            atmosphere: document.getElementById('ModernAtmosphere').value,
        })"""), {'types': [6, 3], 'counts': [41, 0], 'atmosphere': 'vacuum'})
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernPreviousExperiment').click()
        expect(preset).to_have_value('pontchartrain', timeout=30000)

    def test_tensas_preset_compare_and_history_return(self):
        self.open_modern()
        preset = self.page.locator('#ModernPreset')
        preset.select_option('tensas')
        expect(preset).to_have_value('tensas', timeout=30000)
        expect(self.page.locator('#ModernSceneTitle')).to_contain_text('Little Tensas Bayou')
        self.assertEqual(self.page.evaluate("""() => ({
            types: window.CurvatureModernApp.getModel().ObjType,
            counts: window.CurvatureModernApp.getModel().NObjects,
            atmosphere: document.getElementById('ModernAtmosphere').value,
        })"""), {'types': [7, 3], 'counts': [87, 0], 'atmosphere': 'vacuum'})
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernPreviousExperiment').click()
        expect(preset).to_have_value('pontchartrain', timeout=30000)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_preset_compare_and_history_return(self):
        self.open_modern()
        preset = self.page.locator('#ModernPreset')
        preset.select_option('soundly')
        expect(preset).to_have_value('soundly', timeout=30000)
        expect(self.page.locator('#ModernSceneTitle')).to_contain_text('Soundly Causeway')
        self.assertEqual(self.page.evaluate("""() => ({
            types: window.CurvatureModernApp.getModel().ObjType,
            counts: window.CurvatureModernApp.getModel().NObjects,
            atmosphere: document.getElementById('ModernAtmosphere').value,
        })"""), {'types': [8, 3], 'counts': [128, 0], 'atmosphere': 'vacuum'})
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernPreviousExperiment').click()
        expect(preset).to_have_value('pontchartrain', timeout=30000)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_wizard_can_be_opened_and_cancelled(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary').get_by_text('New project', exact=True).click()
        wizard = self.page.locator('#ModernAnimationProjectWizard')
        expect(wizard).to_be_visible()
        expect(wizard).to_contain_text('Step 1 of 5')
        wizard.get_by_role('button', name='Cancel').click()
        expect(wizard).to_be_hidden()

    def test_working_draft_survives_reload(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationViewEditor').click()
        expect(self.page.locator('#ModernAnimationEditorView')).to_be_visible()
        expect(self.page.locator('#ModernAnimationLibraryView')).to_be_hidden()
        studio = self.page.locator('#ModernAnimationStudio')
        name = studio.get_by_label('Project name')
        name.fill('CI autosave workspace')
        expect(name).to_have_value('CI autosave workspace')
        # Give the IndexedDB debounce a chance, but the pagehide/localStorage
        # checkpoint must also protect the edit when reloading.
        self.page.wait_for_timeout(750)
        self.page.reload(wait_until='load')
        self.open_animation()
        self.page.locator('#ModernAnimationViewEditor').click()
        expect(self.page.locator('#ModernAnimationStudio').get_by_label('Project name')).to_have_value(
            'CI autosave workspace'
        )

    def create_camera_project(self, name):
        """Create a real v2 project through the five-step wizard."""
        library = self.page.locator('#ModernAnimationLibrary')
        library.get_by_text('New project', exact=True).click()
        wizard = self.page.locator('#ModernAnimationProjectWizard')
        wizard.get_by_role('button', name='Next').click()  # Camera Motion (default)
        wizard.get_by_role('button', name='Use current Scene/Compare as reference').click()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_role('button', name='Next').click()  # Allowed changes
        wizard.get_by_label('Include reference as first keyframe').check()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_label('Project name').fill(name)
        wizard.get_by_role('button', name='Create project').click()
        expect(library).to_contain_text('1 saved project', timeout=20000)

    def test_wizard_creates_persisted_project(self):
        self.open_modern()
        self.open_animation()
        self.create_camera_project('CI Camera Motion')
        self.page.reload(wait_until='load')
        self.open_animation()
        expect(self.page.locator('#ModernAnimationLibrary')).to_contain_text('CI Camera Motion')

    def test_keyframe_undo_redo_after_focus_leaves_editor(self):
        self.open_modern()
        self.open_animation()
        self.create_camera_project('CI Undo Camera Motion')
        editor = self.page.locator('#ModernAnimationStudio')
        frame_name = editor.get_by_label('Frame name')
        original = frame_name.input_value()
        self.assertTrue(original)
        frame_name.fill('CI renamed keyframe')
        expect(frame_name).to_have_value('CI renamed keyframe')
        # The old regression only listened for Ctrl+Z inside the Studio node.
        # Moving focus out of the editor must not lose keyboard undo.
        editor.locator('.modern-studio-header').click()
        self.page.keyboard.press('Control+z')
        expect(editor.get_by_label('Frame name')).to_have_value(original)
        self.page.keyboard.press('Control+y')
        expect(editor.get_by_label('Frame name')).to_have_value('CI renamed keyframe')



    def test_calibration_projects_distinct_photos_history_and_reload_isolation(self):
        # Two independently imported originals must not exchange correspondence
        # history, calibration stage or photo binding across switches and F5.
        import json
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        toggle=workspace.locator('#ModernCalibrationProjectsToggle')
        first=self.soundly_calibration_experiment()
        second_photo=self.page.evaluate("""async () => {
            const c=document.createElement('canvas');
            c.width=1176;c.height=791;
            const ctx=c.getContext('2d');
            ctx.fillStyle='#2855a5';ctx.fillRect(0,0,c.width,c.height);
            ctx.fillStyle='#edbc42';ctx.fillRect(65,90,200,150);
            const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
            return CurvatureModernReferenceImageImport.ingest(
                new File([blob],'Distinct second original.png',{type:'image/png'}),
                'calibration-regression',window);
        }""")
        second=self.soundly_calibration_experiment(reference=second_photo)
        self.assertNotEqual(first['referenceImage']['original']['dataUrl'],
                            second['referenceImage']['original']['dataUrl'])
        # Keep valid fixture topology while giving B an observably distinct
        # observation bank, even when the reference scene is the same.
        self.assertGreater(len(second['observations']),1)
        second['observations']=second['observations'][:-1]
        expected_counts=[len(first['observations']),len(second['observations'])]
        self.assertNotEqual(*expected_counts)

        toggle.click()
        for count,(filename,data) in enumerate(
                [('first-original.json',first),('second-original.json',second)],start=1):
            panel.locator('#ModernCalibrationProjectsImportFile').set_input_files({
                'name':filename,'mimeType':'application/json',
                'buffer':json.dumps(data).encode('utf-8')})
            # The file input's import handler is asynchronous; do not start
            # the next import until the first project has been committed.
            expect(panel.locator('[data-calibration-project-id]')).to_have_count(
                count,timeout=30000)
        entries=self.page.evaluate("""async () => {
            const rows=await CurvatureModernCalibrationProjectStore.list(indexedDB);
            return Promise.all(rows.filter(r=>r.photo).map(async r=>{
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,r.id);
                return {id:p.id,sha:p.photo.identity.sha256,
                    count:p.checkpoint.payload.draft.rows.length};
            }));
        }""")
        self.assertEqual(len(entries),2,'two imported photos must produce two distinct project rows')
        by_count={r['count']:r for r in entries}
        self.assertTrue(all(n in by_count for n in expected_counts),entries)
        a,b=(by_count[n] for n in expected_counts)
        self.assertNotEqual(a['id'],b['id'])
        self.assertNotEqual(a['sha'],b['sha'])

        def open_project(project):
            if panel.is_hidden():
                toggle.click()
            panel.locator('[data-calibration-project-id="'+project['id']+'"] '
                          '[data-calibration-project-open]').click()
            expect(panel).to_be_hidden(timeout=30000)
            self.assertEqual(self.page.evaluate("""() =>
                CurvatureModernPhotoCalibrationEditor.mount(document)
                    .projectPersistenceStatus().projectId"""),project['id'])
            self.page.wait_for_function("""id => {
                const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                return s.projectId===id && s.pending===0 && !s.unsaved;
            }""",arg=project['id'],timeout=30000)
            # The correspondence list and editing toolbar are disclosure
            # panels; make them visible before clicking their real controls.
            self.page.evaluate("""() => {
                document.getElementById('ModernCalibrationPairList').open=true;
                document.getElementById('ModernCalibrationManualPairs').open=true;
            }""")

        def live_state():
            return self.page.evaluate("""() => {
                const editor=CurvatureModernPhotoCalibrationEditor.mount(document);
                const photo=editor.exportExperiment().referenceImage;
                return {stage:document.querySelector('#ModernPhotoCalibration').dataset.calibrationStage,
                    count:editor.exportExperiment().observations.length,
                    image:photo.original.dataUrl};
            }""")

        open_project(a)
        expect(workspace.locator('#ModernCalibrationPairs tr')).to_have_count(
            expected_counts[0],timeout=30000)
        workspace.locator('#ModernCalibrationPairs tr').first.get_by_role(
            'button',name='Delete').click()
        expect(workspace.locator('#ModernCalibrationPairs tr')).to_have_count(
            expected_counts[0]-1)
        workspace.locator('#ModernCalibrationUndo').click()
        expect(workspace.locator('#ModernCalibrationPairs tr')).to_have_count(
            expected_counts[0])
        workspace.locator('#ModernCalibrationRedo').click()
        expect(workspace.locator('#ModernCalibrationPairs tr')).to_have_count(
            expected_counts[0]-1)
        workspace.locator('#ModernCalibrationUndo').click()
        expect(workspace.locator('#ModernCalibrationPairs tr')).to_have_count(
            expected_counts[0])
        state_a=live_state()
        self.assertEqual((state_a['stage'],state_a['count']),
                         ('correspondences',expected_counts[0]))

        open_project(b)
        state_b=live_state()
        self.assertEqual(state_b['count'],expected_counts[1])
        self.assertNotEqual(state_a['image'],state_b['image'])
        workspace.locator('[data-calibration-stage="calibration"]').click()
        self.page.wait_for_function("""id => {
            const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
            return s.projectId===id && s.pending===0 && !s.unsaved;
        }""",arg=b['id'],timeout=30000)
        state_b=live_state()
        self.assertEqual(state_b['stage'],'calibration')

        open_project(a)
        self.assertEqual(live_state(),state_a)
        # A's history remains usable even after B's independent save.
        # Every Undo/Redo must be acknowledged at a *new* durable revision;
        # matching an older checkpoint with the same row count is insufficient.
        revision=self.page.evaluate("""async id =>
            (await CurvatureModernCalibrationProjectStore.get(indexedDB,id)).revision""",a['id'])
        def await_revision(count,previous):
            self.page.wait_for_function("""async ({id,count,previous}) => {
                const status=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                const row=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return status.projectId===id && !status.unsaved && status.pending===0 &&
                    row?.revision>previous && row.checkpoint.payload.draft.rows.length===count;
            }""",arg={'id':a['id'],'count':count,'previous':previous},timeout=30000)
            return self.page.evaluate("""async id =>
                (await CurvatureModernCalibrationProjectStore.get(indexedDB,id)).revision""",a['id'])
        workspace.locator('#ModernCalibrationRedo').click()
        expect(workspace.locator('#ModernCalibrationPairs tr')).to_have_count(
            expected_counts[0]-1)
        revision=await_revision(expected_counts[0]-1,revision)
        workspace.locator('#ModernCalibrationUndo').click()
        expect(workspace.locator('#ModernCalibrationPairs tr')).to_have_count(
            expected_counts[0])
        revision=await_revision(expected_counts[0],revision)
        self.assertEqual(live_state(),state_a)

        stored=lambda: self.page.evaluate("""async ids => Promise.all(
            ids.map(async id => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return {id,revision:p.revision,sha:p.photo.identity.sha256,
                    stage:p.checkpoint.payload.draft.stage,
                    count:p.checkpoint.payload.draft.rows.length};
            }))""",[a['id'],b['id']])
        before_reload=stored()
        self.assertEqual([p['count'] for p in before_reload],expected_counts,
                         'both checkpoint row counts must be durable before F5')
        self.page.reload(wait_until='load',timeout=30000)
        expect(workspace).to_be_visible(timeout=30000)
        self.assertIsNone(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectBinding()"""))
        after_reload=stored()
        self.assertEqual(after_reload,before_reload,
                         'IndexedDB rows must remain byte-logically unchanged by F5')
        for project,expected in [(b,state_b),(a,state_a)]:
            open_project(project)
            live=live_state()
            durable=stored()
            self.assertEqual({k:v for k,v in live.items() if k!='image'},
                             {k:v for k,v in expected.items() if k!='image'},
                             f'editor rehydration mismatch for {project["id"]}; durable={durable}')
            self.assertEqual(live['image'],expected['image'],
                             'project photo original must remain unchanged')
            active=next(p for p in durable if p['id']==project['id'])
            self.assertEqual((active['sha'],active['stage'],active['count']),
                             (project['sha'],expected['stage'],expected['count']))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],
                         self.console)

    def test_calibration_projects_two_real_fits_apply_without_cross_binding(self):
        # Real Chromium Worker fits and Apply for two separate project IDs,
        # with independent verified originals and preserved outgoing drafts.
        import json
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        toggle=workspace.locator('#ModernCalibrationProjectsToggle')
        first=self.soundly_calibration_experiment()
        second_photo=self.page.evaluate("""async () => {
            const c=document.createElement('canvas');c.width=1176;c.height=791;
            const g=c.getContext('2d');g.fillStyle='#334f8c';
            g.fillRect(0,0,c.width,c.height);
            g.fillStyle='#efc650';g.fillRect(100,110,190,110);
            const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
            return CurvatureModernReferenceImageImport.ingest(
                new File([blob],'Second fit original.png',{type:'image/png'}),
                'calibration-regression',window);
        }""")
        second=self.soundly_calibration_experiment(reference=second_photo)
        self.assertNotEqual(first['referenceImage']['original']['dataUrl'],
                            second['referenceImage']['original']['dataUrl'])
        toggle.click()
        for index,(filename,data) in enumerate(
                [('fit-a.json',first),('fit-b.json',second)],start=1):
            panel.locator('#ModernCalibrationProjectsImportFile').set_input_files({
                'name':filename,'mimeType':'application/json',
                'buffer':json.dumps(data).encode('utf-8')})
            expect(panel.locator('[data-calibration-project-id]')).to_have_count(
                index,timeout=30000)
        records=self.page.evaluate("""async () => {
            const store=CurvatureModernCalibrationProjectStore;
            const summaries=await store.list(indexedDB);
            return Promise.all(summaries.map(async r=>{
                const p=await store.get(indexedDB,r.id);
                return {id:p.id,sha:p.photo?.identity.sha256,results:p.resultIds,
                    observations:p.checkpoint.payload.draft.rows.length};
            }));
        }""")
        self.assertEqual(len(records),2)
        originals=self.page.evaluate("""async photos => Promise.all(
            photos.map(async p => (await CurvatureModernReferenceImageImport.identify(
                p,window)).sha256))""",[first['referenceImage'],second['referenceImage']])
        by_sha={p['sha']:p for p in records}
        self.assertEqual(len(by_sha),2)
        a,b=(by_sha[sha] for sha in originals)
        self.assertNotEqual(a['sha'],b['sha'])
        self.assertEqual((a['observations'],b['observations']),(14,14))
        self.assertEqual((a['results'],b['results']),([],[]))
        original_b=self.page.evaluate("""async id => {
            const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
            return {checkpoint:p.checkpoint,photo:p.photo,resultIds:p.resultIds};
        }""",b['id'])

        def open_project(id):
            if panel.is_hidden():
                toggle.click()
            card=panel.locator('[data-calibration-project-id="'+id+'"]')
            if card.get_attribute('data-project-active')=='true':
                expect(card.locator('[data-calibration-project-open]')).to_have_count(0)
                toggle.click()
            else:
                card.locator('[data-calibration-project-open]').click()
            expect(panel).to_be_hidden(timeout=30000)
            self.page.wait_for_function("""id => {
                const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                return s?.projectId===id && s.pending===0 && !s.unsaved;
            }""",arg=id,timeout=30000)

        def saved(id):
            return self.page.evaluate("""async id => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return {photo:p.photo,checkpoint:p.checkpoint,resultIds:p.resultIds};
            }""",id)

        results={}
        for index,project in enumerate((a,b)):
            if index:
                expect(self.page.locator('#ModernSceneTab')).to_have_attribute(
                    'aria-pressed','true',timeout=30000)
                self.page.locator('#ModernPhotoCalibrationOpen').click()
                expect(workspace).to_be_visible(timeout=30000)
            open_project(project['id'])
            expect(workspace.locator('#ModernCalibrationPhotoInfo')).to_be_visible()
            self.assertEqual(self.page.evaluate("""() =>
                CurvatureModernPhotoCalibrationEditor.mount(document)
                    .projectBinding()?.projectId"""),project['id'])
            self.assertEqual(saved(project['id'])['photo']['identity']['sha256'],
                             project['sha'])
            workspace.locator('[data-calibration-stage="calibration"]').click()
            run=workspace.locator('#ModernCalibrationRunFit')
            expect(run).to_be_enabled(timeout=30000)
            run.click()
            button=workspace.locator('#ModernCalibrationApplyScene')
            expect(button).to_be_enabled(timeout=120000)
            fitted=self.page.evaluate("""() =>
                CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()""")
            fit=fitted['fit']['result']
            self.assertTrue(fit['evaluation']['valid'])
            self.assertGreater(fit['acceptedSteps'],0)
            self.assertEqual(len(fit['evaluation']['points']),14)
            self.assertLess(fit['evaluation']['rmsPx'],15)
            self.assertEqual(fitted['observations'],first['observations'])
            self.assertEqual(fitted['referenceImage']['original'],
                             (first if index==0 else second)['referenceImage']['original'])
            if index==0:
                self.assertEqual(saved(b['id'])['checkpoint'],original_b['checkpoint'])
                self.assertEqual(saved(b['id'])['resultIds'],[])
            self.page.once('dialog',lambda prompt:prompt.accept())
            button.click()
            expect(workspace.locator('#ModernCalibrationApplyStatus')).to_contain_text(
                'Applied to Scene',timeout=30000)
            self.page.wait_for_function("""id => {
                const a=CurvatureModernApp;
                return a.getWorkspaceMode()==='scene' &&
                    document.querySelector('#ModernSceneTab')?.getAttribute('aria-pressed')==='true';
            }""",arg=project['id'],timeout=30000)
            self.page.wait_for_function("""async id => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return p?.resultIds.length===1;
            }""",arg=project['id'],timeout=30000)
            applied=saved(project['id'])
            results[project['id']]=applied['resultIds'][0]
            self.assertEqual(applied['photo']['identity']['sha256'],project['sha'])
            self.assertEqual(len(applied['checkpoint']['payload']['draft']['rows']),14)
            self.assertEqual(applied['checkpoint']['payload']['draft']['fitBest']['evaluation']['valid'],True)
            if index==0:
                # Applying A must not create a link or change B's checkpoint.
                self.assertEqual(saved(b['id'])['checkpoint'],original_b['checkpoint'])
                self.assertEqual(saved(b['id'])['resultIds'],[])
        self.assertNotEqual(results[a['id']],results[b['id']])
        archive=self.page.evaluate("""async ids => {
            const store=CurvatureModernCalibrationResultArchive;
            const rows=await Promise.all(ids.map(id=>store.get(indexedDB,id)));
            return rows.map(x=>({
                photo:x.record.payload.photo.sha256,
                project:x.record.provenance.projectId,
                valid:x.record.payload.fit.result.evaluation.valid}));
        }""",[results[a['id']],results[b['id']]])
        self.assertEqual([row['project'] for row in archive],[a['id'],b['id']])
        self.assertEqual([row['valid'] for row in archive],[True,True])
        self.assertEqual([row['photo'] for row in archive],[a['sha'],b['sha']])
        self.page.reload(wait_until='load',timeout=30000)
        after=[saved(a['id']),saved(b['id'])]
        self.assertEqual([v['resultIds'] for v in after],
                         [[results[a['id']]],[results[b['id']]]])
        self.assertEqual([v['photo']['identity']['sha256'] for v in after],
                         [a['sha'],b['sha']])
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],
                         self.console)

    def test_calibration_project_apply_preserves_exact_history_and_portable_exports(self):
        # Qualification: the *outgoing* Scene, not the fitted replacement,
        # survives Apply in pinned History; project JSON exports remain
        # self-contained and independent across switch and F5.
        import json
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        toggle=workspace.locator('#ModernCalibrationProjectsToggle')
        workspace.locator('#ModernCalibrationClose').click()
        self.page.locator('#ModernRender').click()
        expect(self.page.locator('#ModernPersistenceStatus')).to_have_text(
            'Working session saved',timeout=30000)
        outgoing=self.page.evaluate("""async () =>
            (await CurvatureModernSessionAutosave.read(indexedDB)).experiment""")
        self.assertEqual(outgoing['display']['mode'],'scene')
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(workspace).to_be_visible(timeout=30000)
        fixture=self.soundly_calibration_experiment()
        toggle.click()
        panel.locator('#ModernCalibrationProjectsImportFile').set_input_files({
            'name':'portable-history-a.json','mimeType':'application/json',
            'buffer':json.dumps(fixture).encode('utf-8')})
        original=panel.locator('[data-calibration-project-id]').filter(
            has_text='Soundly regression raster')
        expect(original).to_have_count(1,timeout=30000)
        a=original.get_attribute('data-calibration-project-id')
        original.locator('[data-calibration-project-duplicate]').click()
        duplicate=panel.locator('[data-calibration-project-id]').filter(
            has_text='Soundly regression raster.png (copy)')
        expect(duplicate).to_have_count(1,timeout=30000)
        b=duplicate.get_attribute('data-calibration-project-id')
        self.assertNotEqual(a,b)

        def open_project(id):
            if panel.is_hidden():
                toggle.click()
            card=panel.locator('[data-calibration-project-id="'+id+'"]')
            # Active projects intentionally do not expose a redundant Open
            # button. Keep the existing live editor rather than reopening it.
            if card.get_attribute('data-project-active')=='true':
                expect(card.locator('[data-calibration-project-open]')).to_have_count(0)
                toggle.click()
            else:
                card.locator('[data-calibration-project-open]').click()
            expect(panel).to_be_hidden(timeout=30000)
            self.page.wait_for_function("""id => {
                const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                return s?.projectId===id && s.pending===0 && !s.unsaved;
            }""",arg=id,timeout=30000)

        def export_file():
            with self.page.expect_download() as downloaded:
                workspace.locator('#ModernCalibrationExportExperiment').click()
            with open(downloaded.value.path(),encoding='utf-8') as stream:
                data=json.load(stream)
            self.assertEqual(data['format'],'curvature-photo-calibration')
            self.assertEqual(data['referenceImage']['original'],
                             fixture['referenceImage']['original'])
            self.assertEqual(data['observations'],fixture['observations'])
            self.assertFalse(data['fit']['running'])
            return data

        def history():
            return self.page.evaluate("""async () =>
                CurvatureModernApp.getHistoryStore().list()""")

        def durable(id):
            return self.page.evaluate("""async id => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return {resultIds:p.resultIds,rows:p.checkpoint.payload.draft.rows,
                    photo:p.photo.identity.sha256};
            }""",id)

        open_project(b)
        export_b=export_file()
        snapshot_b=durable(b)
        self.assertEqual(snapshot_b['resultIds'],[])
        open_project(a)
        workspace.locator('[data-calibration-stage="calibration"]').click()
        fit=workspace.locator('#ModernCalibrationRunFit')
        expect(fit).to_be_enabled(timeout=30000)
        fit.click()
        apply=workspace.locator('#ModernCalibrationApplyScene')
        expect(apply).to_be_enabled(timeout=120000)
        fitted=export_file()
        self.assertTrue(fitted['fit']['result']['evaluation']['valid'])
        self.assertGreater(fitted['fit']['result']['acceptedSteps'],0)
        self.assertLess(fitted['fit']['result']['evaluation']['rmsPx'],15)
        self.assertEqual(durable(b),snapshot_b,
                         'fitting A must not mutate B or its original photo')
        before_history=history()
        self.page.once('dialog',lambda dialog:dialog.accept())
        apply.click()
        expect(workspace.locator('#ModernCalibrationApplyStatus')).to_contain_text(
            'Applied to Scene',timeout=30000)
        expect(self.page.locator('#ModernSceneTab')).to_have_attribute(
            'aria-pressed','true',timeout=30000)
        self.page.wait_for_function("""async id => {
            const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
            return p?.resultIds.length===1;
        }""",arg=a,timeout=30000)
        result_id=durable(a)['resultIds'][0]
        self.assertEqual(durable(b),snapshot_b)
        after_history=history()
        recovery=[row for row in after_history
                  if row['pinned'] and row['source']=='recovery'
                  and row['experiment']==outgoing]
        self.assertEqual(len(recovery),1,
                         'Apply must pin the exact outgoing Scene, not the fitted Scene')
        recovery_id=recovery[0]['id']
        self.assertFalse(any(
            (row['experiment'].get('calibrationOrigin') or {}).get('resultId')==result_id
            for row in after_history),
            'outgoing History must not be rewritten with fitted attribution')
        self.assertGreaterEqual(len(after_history),len(before_history))

        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(workspace).to_be_visible(timeout=30000)
        open_project(a)
        export_a=export_file()
        self.assertEqual(export_a,fitted)
        open_project(b)
        self.assertEqual(export_file(),export_b)
        self.assertEqual(durable(b),snapshot_b)

        self.page.reload(wait_until='load',timeout=30000)
        expect(workspace).to_be_visible(timeout=30000)
        current_history=history()
        pinned=[row for row in current_history if row['id']==recovery_id]
        self.assertEqual(len(pinned),1)
        self.assertTrue(pinned[0]['pinned'])
        self.assertEqual(pinned[0]['source'],'recovery')
        self.assertEqual(pinned[0]['experiment'],outgoing)
        self.assertEqual(durable(a)['resultIds'],[result_id])
        self.assertEqual(durable(b),snapshot_b)
        for id,expected in [(a,export_a),(b,export_b)]:
            open_project(id)
            self.assertEqual(export_file(),expected,
                             'portable export changed after project switch/F5')
        archived=self.page.evaluate("""async id => {
            const p=await CurvatureModernCalibrationResultArchive.get(indexedDB,id);
            return {project:p.record.provenance.projectId,
                original:p.record.payload.photo.sha256,
                valid:p.record.payload.fit.result.evaluation.valid};
        }""",result_id)
        self.assertEqual(archived['project'],a)
        self.assertTrue(archived['valid'])
        self.assertEqual(archived['original'],durable(a)['photo'])
        self.assertFalse([x for x in self.console if x.startswith('PAGE ERROR:')],
                         self.console)

    def test_calibration_project_missing_original_rejects_open_and_restores_after_reimport(self):
        # Simulate external damage to the image DB, not the application's
        # protected (non-deleting) Library API. Opening the damaged project
        # must fail closed while the other project's editor and portable
        # export remain intact. Re-ingesting the exact original restores it.
        import json
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        toggle=workspace.locator('#ModernCalibrationProjectsToggle')
        first=self.soundly_calibration_experiment()
        second_photo=self.page.evaluate("""async () => {
            const canvas=document.createElement('canvas');
            canvas.width=1176;canvas.height=791;
            const context=canvas.getContext('2d');
            context.fillStyle='#2a578b';
            context.fillRect(0,0,canvas.width,canvas.height);
            context.fillStyle='#f8b94f';
            context.fillRect(50,65,165,120);
            const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
            return CurvatureModernReferenceImageImport.ingest(
                new File([blob],'Unrelated intact photo.png',{type:'image/png'}),
                'calibration-regression',window);
        }""")
        second=self.soundly_calibration_experiment(reference=second_photo)
        second['observations']=second['observations'][:-1]
        toggle.click()
        for count,(filename,data) in enumerate(
                [('missing-original-a.json',first),('intact-original-b.json',second)],start=1):
            panel.locator('#ModernCalibrationProjectsImportFile').set_input_files({
                'name':filename,'mimeType':'application/json',
                'buffer':json.dumps(data).encode('utf-8')})
            expect(panel.locator('[data-calibration-project-id]')).to_have_count(
                count,timeout=30000)
        projects=self.page.evaluate("""async () => {
            const store=CurvatureModernCalibrationProjectStore;
            const summaries=await store.list(indexedDB);
            return Promise.all(summaries.map(async item=>{
                const p=await store.get(indexedDB,item.id);
                return {id:p.id,sha:p.photo.identity.sha256,
                    count:p.checkpoint.payload.draft.rows.length};
            }));
        }""")
        self.assertEqual(len(projects),2)
        by_count={p['count']:p for p in projects}
        a,b=by_count[14],by_count[13]
        self.assertNotEqual(a['sha'],b['sha'])

        def stored():
            return self.page.evaluate("""async ids => Promise.all(ids.map(async id=>{
                const row=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return {id,photo:row.photo,checkpoint:row.checkpoint,
                    resultIds:row.resultIds};
            }))""",[a['id'],b['id']])

        def active():
            return self.page.evaluate("""() =>
                CurvatureModernPhotoCalibrationEditor.mount(document)
                    .projectPersistenceStatus()?.projectId""")

        panel.locator('[data-calibration-project-id="'+b['id']+'"] '
                      '[data-calibration-project-open]').click()
        expect(panel).to_be_hidden(timeout=30000)
        self.page.wait_for_function("""id => {
            const status=CurvatureModernPhotoCalibrationEditor.mount(document)
                .projectPersistenceStatus();
            return status?.projectId===id && status.pending===0 && !status.unsaved;
        }""",arg=b['id'],timeout=30000)
        self.assertEqual(active(),b['id'])
        baseline=stored()
        before_export=self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()""")
        self.assertEqual(before_export['observations'],second['observations'])
        self.assertEqual(before_export['referenceImage']['original'],
                         second['referenceImage']['original'])

        # Bypass disabled user deletion deliberately to model a damaged or
        # externally cleared IndexedDB photo row; leave project rows intact.
        damage=self.page.evaluate("""async identity => {
            const lib=CurvatureModernReferenceImageLibrary;
            const found=await lib.findOriginal(indexedDB,identity,crypto,
                record=>CurvatureModernReferenceImageImport.verifyOriginal(record,window));
            if(!found)throw Error('Fixture original was never stored');
            const blocked=await lib.remove(indexedDB,found.id).then(
                ()=>false,error=>/disabled/.test(error.message));
            if(!blocked)throw Error('Public reference deletion unexpectedly permitted');
            await new Promise((resolve,reject)=>{
                const request=indexedDB.open(lib.DATABASE,1);
                request.onerror=()=>reject(request.error);
                request.onsuccess=()=>{
                    const db=request.result,tx=db.transaction(lib.STORE,'readwrite');
                    tx.objectStore(lib.STORE).delete(found.id);
                    tx.oncomplete=()=>{db.close();resolve();};
                    tx.onabort=()=>{db.close();reject(tx.error);};
                    tx.onerror=()=>{db.close();reject(tx.error);};
                };
            });
            const missing=await lib.findOriginal(indexedDB,identity,crypto,
                record=>CurvatureModernReferenceImageImport.verifyOriginal(record,window));
            return {blocked,missing:missing===null,removed:found.id};
        }""",baseline[0]['photo']['identity'])
        self.assertEqual((damage['blocked'],damage['missing']),(True,True))
        self.assertEqual(stored(),baseline,
                         'missing Library original must not delete any project checkpoint')

        self.page.reload(wait_until='load',timeout=30000)
        expect(workspace).to_be_visible(timeout=30000)
        toggle.click()
        expect(panel).to_be_visible(timeout=30000)
        damaged=panel.locator('[data-calibration-project-id="'+a['id']+'"]')
        intact=panel.locator('[data-calibration-project-id="'+b['id']+'"]')
        expect(damaged).to_contain_text('Photograph unavailable',timeout=30000)
        expect(intact.locator('img[alt="Reference photograph"]')).to_be_visible(
            timeout=30000)
        intact.locator('[data-calibration-project-open]').click()
        expect(panel).to_be_hidden(timeout=30000)
        self.page.wait_for_function("""id => {
            const status=CurvatureModernPhotoCalibrationEditor.mount(document)
                .projectPersistenceStatus();
            return status?.projectId===id && status.pending===0 && !status.unsaved;
        }""",arg=b['id'],timeout=30000)
        before_failed_open=stored()
        self.assertEqual(before_failed_open[0],baseline[0],
                         'a missing original must not alter its owning project')
        toggle.click()
        damaged=panel.locator('[data-calibration-project-id="'+a['id']+'"]')
        damaged.locator('[data-calibration-project-open]').click()
        expect(panel).to_be_visible(timeout=30000)
        expect(panel.locator('#ModernCalibrationProjectsStatus')).to_contain_text(
            'Cannot open project: Verified original photograph unavailable',
            timeout=30000)
        expect(panel.locator('#ModernCalibrationProjectsStatus')).to_contain_text(
            'The current editor was retained.',timeout=30000)
        self.assertEqual(active(),b['id'])
        after_failed_open=stored()
        self.assertEqual(after_failed_open[0],baseline[0],
                         'missing-photo project must never be activated or rewritten')
        self.assertEqual(after_failed_open[1]['photo'],before_failed_open[1]['photo'])
        self.assertEqual(after_failed_open[1]['resultIds'],
                         before_failed_open[1]['resultIds'])
        # Guarded switching is allowed (and required) to durably flush the
        # outgoing B editor, including its newly fitted view/inline state.
        # That valid checkpoint flush must not be mistaken for A corruption.
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()"""),
            before_export)

        # The unaffected B editor still allows a complete portable download.
        toggle.click()
        with self.page.expect_download() as exported:
            workspace.locator('#ModernCalibrationExportExperiment').click()
        with open(exported.value.path(),encoding='utf-8') as stream:
            portable_b=json.load(stream)
        self.assertEqual(portable_b,before_export)
        toggle.click()
        # Re-ingest only the known genuine original through the public
        # verified content-addressed Library API. No synthetic replacement
        # or mutation of A's project rows is permitted.
        restored=self.page.evaluate("""async image => {
            const lib=CurvatureModernReferenceImageLibrary;
            const result=await lib.ensureOriginal(indexedDB,image,crypto,
                record=>CurvatureModernReferenceImageImport.verifyOriginal(record,window));
            return {sha:(await CurvatureModernReferenceImageImport.identify(image,window)).sha256,
                rowId:result.row.id};
        }""",first['referenceImage'])
        self.assertEqual(restored['sha'],a['sha'])
        self.assertEqual(stored(),after_failed_open)
        panel.locator('[data-calibration-project-id="'+a['id']+'"] '
                      '[data-calibration-project-open]').click()
        expect(panel).to_be_hidden(timeout=30000)
        self.page.wait_for_function("""id =>
            CurvatureModernPhotoCalibrationEditor.mount(document)
                .projectPersistenceStatus()?.projectId===id""",
            arg=a['id'],timeout=30000)
        recovered=self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()""")
        self.assertEqual(recovered['observations'],first['observations'])
        self.assertEqual(recovered['referenceImage']['original'],
                         first['referenceImage']['original'])
        self.assertEqual(active(),a['id'])
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],
                         self.console)

    def test_calibration_projects_independent_photo_viewports_survive_reload(self):
        # Real wheel zoom must durably save each independently bound project
        # without requiring a project switch to flush its viewport.
        import json
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        toggle=workspace.locator('#ModernCalibrationProjectsToggle')
        fixture=self.soundly_calibration_experiment()
        toggle.click()
        panel.locator('#ModernCalibrationProjectsImportFile').set_input_files({
            'name':'viewport-source.json','mimeType':'application/json',
            'buffer':json.dumps(fixture).encode('utf-8')})
        source=panel.locator('[data-calibration-project-id]').filter(
            has_text='Soundly regression raster')
        expect(source).to_have_count(1,timeout=30000)
        a=source.get_attribute('data-calibration-project-id')
        source.locator('[data-calibration-project-duplicate]').click()
        duplicate=panel.locator('[data-calibration-project-id]').filter(
            has_text='Soundly regression raster.png (copy)')
        expect(duplicate).to_have_count(1,timeout=30000)
        b=duplicate.get_attribute('data-calibration-project-id')
        self.assertNotEqual(a,b)

        def open_project(id):
            if panel.is_hidden():
                toggle.click()
            card=panel.locator('[data-calibration-project-id="'+id+'"]')
            # Active projects intentionally do not expose a redundant Open
            # button. Keep the existing live editor rather than reopening it.
            if card.get_attribute('data-project-active')=='true':
                expect(card.locator('[data-calibration-project-open]')).to_have_count(0)
                toggle.click()
            else:
                card.locator('[data-calibration-project-open]').click()
            expect(panel).to_be_hidden(timeout=30000)
            self.page.wait_for_function("""id => {
                const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                return s?.projectId===id && s.pending===0 && !s.unsaved;
            }""",arg=id,timeout=30000)

        def stored(id):
            return self.page.evaluate("""async id => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                return {revision:p.revision,view:p.checkpoint.payload.draft.view,
                    sha:p.photo.identity.sha256};
            }""",id)

        def live_view():
            return self.page.evaluate("""async () =>
                (await CurvatureModernPhotoCalibrationEditor.mount(document)
                    .captureProjectCheckpoint()).checkpoint.payload.draft.view""")

        def zoom_and_save(id,delta):
            before=stored(id)
            photo=workspace.locator('#ModernCalibrationPhoto')
            expect(photo).to_be_visible()
            photo.hover(position={'x':80,'y':65})
            self.page.mouse.wheel(0,delta)
            expected=live_view()
            self.assertIsNotNone(expected,'wheel zoom must update the live photo viewport')
            self.assertNotEqual(expected,before['view'])
            # An unrelated autosave may advance the revision before the wheel
            # snapshot is committed: wait for these exact viewport values.
            self.page.wait_for_function("""async ({id,revision,expected}) => {
                const p=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
                const s=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
                return p.revision>revision && s.projectId===id && !s.unsaved && s.pending===0 &&
                    JSON.stringify(p.checkpoint.payload.draft.view)===JSON.stringify(expected);
            }""",arg={'id':id,'revision':before['revision'],'expected':expected},timeout=30000)
            after=stored(id)
            self.assertEqual(after['view'],expected)
            self.assertEqual(live_view(),after['view'])
            self.assertEqual(after['sha'],before['sha'])
            return after

        open_project(a)
        self.assertIsNotNone(live_view(),
                             'imported photo must start with a fitted viewport')
        view_a=zoom_and_save(a,-490)
        # A real Shift+drag pans the photo canvas rather than moving a
        # correspondence marker. Pan must persist without a project switch.
        before_pan=view_a
        photo=workspace.locator('#ModernCalibrationPhoto')
        bounds=photo.bounding_box()
        self.assertIsNotNone(bounds)
        start_x=bounds['x']+90
        start_y=bounds['y']+90
        self.page.keyboard.down('Shift')
        try:
            self.page.mouse.move(start_x,start_y)
            self.page.mouse.down()
            self.page.mouse.move(start_x+42,start_y+27,steps=5)
            self.page.mouse.up()
        finally:
            self.page.keyboard.up('Shift')
        panned=live_view()
        self.assertNotEqual(panned,before_pan['view'],
                            'dragging the canvas must change the photo position')
        self.assertEqual(panned['scale'],before_pan['view']['scale'])
        self.page.wait_for_function("""async ({id,revision,expected}) => {
            const row=await CurvatureModernCalibrationProjectStore.get(indexedDB,id);
            const status=CurvatureModernPhotoCalibrationEditor.mount(document).projectPersistenceStatus();
            return row.revision>revision && status.projectId===id &&
                !status.unsaved && status.pending===0 &&
                JSON.stringify(row.checkpoint.payload.draft.view)===JSON.stringify(expected);
        }""",arg={'id':a,'revision':before_pan['revision'],'expected':panned},timeout=30000)
        view_a=stored(a)
        self.assertEqual(view_a['view'],panned)
        open_project(b)
        self.assertIsNotNone(live_view(),
                             'duplicate photo must have a valid initial viewport')
        self.assertNotEqual(live_view(),view_a['view'],
                            'a duplicate starts with the original fit viewport')
        view_b=zoom_and_save(b,370)
        self.assertNotEqual(view_a['view'],view_b['view'])
        open_project(a)
        self.assertEqual(live_view(),view_a['view'])
        saved_b=stored(b)
        self.assertEqual((saved_b['view'],saved_b['sha']),
                         (view_b['view'],view_b['sha']),
                         'switch may advance revision but must not alter B viewport')
        self.page.reload(wait_until='load',timeout=30000)
        expect(workspace).to_be_visible(timeout=30000)
        self.assertIsNone(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectBinding()"""))
        for id,expected in [(b,view_b),(a,view_a)]:
            open_project(id)
            self.assertEqual(live_view(),expected['view'])
            current=stored(id)
            self.assertEqual(current['view'],expected['view'])
            self.assertEqual(current['sha'],expected['sha'])
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],
                         self.console)

    def test_calibration_projects_thumbnail_and_workspace_view_survive_reload(self):
        import json
        workspace=self.open_physical_calibration()
        panel=workspace.locator('#ModernCalibrationProjectsPanel')
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        data=self.soundly_calibration_experiment()
        panel.locator('#ModernCalibrationProjectsImportFile').set_input_files({
            'name':'photo-project.json','mimeType':'application/json',
            'buffer':json.dumps(data).encode('utf-8')})
        entry=panel.locator('[data-calibration-project-id]').filter(
            has_text='Soundly regression raster')
        expect(entry).to_have_count(1,timeout=30000)
        image=entry.locator('.modern-calibration-project-preview img')
        expect(image).to_be_visible(timeout=30000)
        self.assertTrue(image.evaluate('(node) => node.complete && node.naturalWidth > 0'))
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernApplicationPreferences.read(localStorage).workspace.calibrationView"""),
            'projects')
        self.page.reload(wait_until='load')
        expect(panel).to_be_visible(timeout=30000)
        expect(workspace.locator('.modern-calibration-stages')).to_be_visible()
        expect(image).to_be_visible(timeout=30000)
        self.assertTrue(image.evaluate('(node) => node.complete && node.naturalWidth > 0'))
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getWorkspaceMode()"),'calibration')
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernPhotoCalibrationEditor.mount(document).projectBinding()"""),None)
        workspace.locator('#ModernCalibrationProjectsToggle').click()
        expect(panel).to_be_hidden()
        self.assertEqual(self.page.evaluate("""() =>
            CurvatureModernApplicationPreferences.read(localStorage).workspace.calibrationView"""),
            'editor')
        self.page.reload(wait_until='load')
        expect(workspace).to_be_visible(timeout=30000)
        expect(panel).to_be_hidden()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')],self.console)


if __name__ == '__main__':
    unittest.main()
