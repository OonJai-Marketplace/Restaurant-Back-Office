package org.oonjai.pos;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

@CapacitorPlugin(name = "OonJaiLocalLink")
public class OonJaiLocalLinkPlugin extends Plugin {
    private volatile ServerSocket server;
    private final Map<String, Socket> pending = new ConcurrentHashMap<>();
    private final ExecutorService workers = Executors.newFixedThreadPool(10);
    private static boolean local(String host) {
        if (host == null || !host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return false;
        String[] parts = host.split("\\."); int[] p = new int[4];
        for (int i=0; i<4; i++) { p[i]=Integer.parseInt(parts[i]); if(p[i]>255) return false; }
        return p[0]==10 || p[0]==192&&p[1]==168 || p[0]==172&&p[1]>=16&&p[1]<=31 || p[0]==169&&p[1]==254;
    }
    private static String read(Socket socket) throws IOException {
        socket.setSoTimeout(5000);
        ByteArrayOutputStream out = new ByteArrayOutputStream(); InputStream in=socket.getInputStream();
        for(int i=0;i<100000;i++) { int b=in.read(); if(b<0) throw new EOFException(); if(b==10) return out.toString("UTF-8"); out.write(b); }
        throw new IOException("Message too large");
    }
    private static void write(Socket socket, String payload) throws IOException {
        if(payload==null || payload.getBytes(StandardCharsets.UTF_8).length>100000 || payload.contains("\n")) throw new IOException("Invalid message");
        socket.getOutputStream().write((payload+"\n").getBytes(StandardCharsets.UTF_8)); socket.getOutputStream().flush();
    }
    private void closeAll() {
        ServerSocket old=server;server=null;
        try { if(old!=null) old.close(); } catch(IOException ignored) {}
        pending.values().forEach(s->{try{s.close();}catch(IOException ignored){}});pending.clear();
    }
    @PluginMethod public void start(PluginCall call) {
        workers.execute(()->{
            closeAll();
            try {
                ServerSocket current=new ServerSocket();current.setReuseAddress(true);current.bind(new InetSocketAddress("0.0.0.0",19741));server=current;
                JSArray addresses=new JSArray();
                for(NetworkInterface ni:Collections.list(NetworkInterface.getNetworkInterfaces())) for(InetAddress address:Collections.list(ni.getInetAddresses())) if(address instanceof Inet4Address && local(address.getHostAddress())) addresses.put(address.getHostAddress());
                JSObject result=new JSObject();result.put("port",19741);result.put("addresses",addresses);call.resolve(result);
                while(!current.isClosed()) {
                    Socket socket=current.accept();
                    if(!local(socket.getInetAddress().getHostAddress())||pending.size()>=8){socket.close();continue;}
                    String id=UUID.randomUUID().toString();pending.put(id,socket);
                    new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(()->{Socket stale=pending.remove(id);try{if(stale!=null)stale.close();}catch(IOException ignored){}},5000);
                    workers.execute(()->{
                        try {
                            String payload=read(socket); JSObject event=new JSObject();event.put("id",id);event.put("payload",payload);notifyListeners("request",event);
                        } catch(Exception e){pending.remove(id);try{socket.close();}catch(IOException ignored){}}
                    });
                }
            } catch(Exception e){if(server!=null)call.reject("Local listener unavailable: "+e.getMessage());}
        });
    }
    @PluginMethod public void stop(PluginCall call){closeAll();call.resolve();}
    @PluginMethod public void reply(PluginCall call){
        workers.execute(()->{Socket socket=pending.remove(call.getString("id", ""));try{if(socket!=null){write(socket,call.getString("payload"));socket.close();}call.resolve();}catch(Exception e){try{if(socket!=null)socket.close();}catch(IOException ignored){}call.reject("Reply failed");}});
    }
    @PluginMethod public void exchange(PluginCall call){
        String host=call.getString("host");int port=call.getInt("port",0);
        if(!local(host)||port<1024||port>65535){call.reject("Invalid local connection");return;}
        workers.execute(()->{try(Socket socket=new Socket()){
            socket.connect(new InetSocketAddress(host,port),5000);write(socket,call.getString("payload"));JSObject result=new JSObject();result.put("payload",read(socket));call.resolve(result);
        }catch(Exception e){call.reject("Display connection unavailable");}});
    }
    @Override protected void handleOnDestroy(){closeAll();workers.shutdownNow();}
}
