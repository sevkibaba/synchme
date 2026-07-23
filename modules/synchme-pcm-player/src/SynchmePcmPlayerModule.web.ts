import { registerWebModule, NativeModule } from 'expo';

class SynchmePcmPlayerModule extends NativeModule<{}> {}

export default registerWebModule(SynchmePcmPlayerModule, 'SynchmePcmPlayerModule');
