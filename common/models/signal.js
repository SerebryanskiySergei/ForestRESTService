var loopback = require("loopback");

module.exports = function(Signal) {

  Signal.observe('after save', function(ctx, next) {
    if (ctx.instance) {
      function intersect (m, n, res) {
        const EPS = 1e-9;
        function det (a, b, c, d) {
          return a * d - b * c;
        }
        var zn = det (m.a, m.b, n.a, n.b);
        if (Math.abs (zn) < EPS)
          return false;
        res.lat = - det (m.c, m.b, n.c, n.b) / zn;
        res.lng = - det (m.a, m.c, n.a, n.c) / zn;
        return true;
      }
      function geron(a,b,c){
        var p = (a+b+c)/2;
        return Math.sqrt(p*(p-a)*(p-b)*(p-c));
      }
      function createLine(angle,x,y){
        return {                                // a*y + b*x + c = 0
          a: -1,
          b: Math.tan(de_ra(90 - angle)),          // b = tg(90-alpha)
          c: -(Math.tan(de_ra(90 - angle)) * x - y)  //c = -(tg(90-alpha)*x - y)
        };
      }

      function ra_de(value) {
        return ((eval(value)) * (180 / Math.PI));
      }
      function de_ra(value) {
        return ((eval(value)) * (Math.PI / 180));
      }


      /*
       Находим центр опасной зоны как точку пересечения биссектрис
       */
      Signal.findOne({include: {devices: {}}},function(err,signal){
        var firstBiss = createLine((signal.right_angle + signal.left_angle)/2,signal.devices().location.lat,signal.devices().location.lng);
        // Определили биссектрису только что пришедшего сигнала firstBiss
        Signal.find( {include: {devices: {}}},function(err, signals) {
          signals.forEach(function(item, i, arr) {
            if (item.id != signal.id){
              // формируем биссектрису для второго сигнала
              var secondBiss = createLine((item.right_angle+item.left_angle)/2,item.devices().location.lat,item.devices().location.lng);
              var intersection = {};
              // Вызываем функцию нахождения пересечения и если это пересечение есть, находим радиус окружности
              if (intersect(firstBiss, secondBiss, intersection)){
                // нужно найти радиус
                // создаем линии, образованные углами сигналов, и ищем их попарные пересечения
                var firstOriginalLine = createLine(signal.right_angle,signal.devices().location.lat,signal.devices().location.lng);
                var secondOriginalLine = createLine(signal.left_angle,signal.devices().location.lat,signal.devices().location.lng);
                var thirdOriginalLine = createLine(item.right_angle,item.devices().location.lat,item.devices().location.lng);
                var fourthOriginalLine = createLine(item.left_angle,item.devices().location.lat,item.devices().location.lng);
                var points ={a:new loopback.GeoPoint(0,0),b:new loopback.GeoPoint(0,0),c:new loopback.GeoPoint(0,0),d:new loopback.GeoPoint(0,0)};
                if(intersect(firstOriginalLine,thirdOriginalLine,points.a) && intersect(firstOriginalLine,fourthOriginalLine,points.b)
                  && intersect(secondOriginalLine,thirdOriginalLine,points.c) && intersect(secondOriginalLine,fourthOriginalLine,points.d) ){
                  // нашли вершины четырехугольника
                  // определяем длины сторон четырехугольника
                  var ab = loopback.GeoPoint.distanceBetween(points.a, points.b, {type: 'kilometers'});
                  var ac = loopback.GeoPoint.distanceBetween(points.a, points.c, {type: 'kilometers'});
                  var ad = loopback.GeoPoint.distanceBetween(points.a, points.d, {type: 'kilometers'});
                  var cd = loopback.GeoPoint.distanceBetween(points.c, points.d, {type: 'kilometers'});
                  var bc = loopback.GeoPoint.distanceBetween(points.b, points.c, {type: 'kilometers'});
                  var radius =0;
                  //проверяем,можно ли вписать окружность
                  if(ab+cd == ad+bc){
                    // ищем его площадь как сумму площадей треугольников, образованных при соединении одной из вершин с противоположной
                    // площади треугольников ищем по формуле Герона
                    // Находим площади треугольников по формуле Герона
                    var firstS= geron(ab,cd,ac);
                    var secondS = geron(ac,cd,ad);
                    var resultS = firstS+secondS;
                    // Находим радиус вписанной окружности, как отношение площади четырехугольника к его полупериметру
                    radius= resultS/((ab+bc+cd+ad)/2);
                  }
                  else{
                    // берем радиус как среднее арифтемтисеское диагоналей прямоугольника
                    var bd = loopback.GeoPoint.distanceBetween(points.b, points.d, {type: 'kilometers'});
                    radius = (ac+bd)/2;
                  }

                  // записываем в базу данных данные о новой зоне
                  var newZone = {
                    "radius": radius,
                    "center": new loopback.GeoPoint({lat: intersection.lat, lng: intersection.lng}),
                    "status": "active"
                  };

                  var Zone = Signal.app.models.Zone;
                  Zone.create(newZone, function (err, u1) {
                    console.log('Created: ', u1.toObject());
                    Zone.findById(u1.id, function (err, u2) {
                      console.log('Found: ', u2.toObject());
                    });
                  });
                }
              }
            }
          });
        });
      });
    }
    next();
  });


};
