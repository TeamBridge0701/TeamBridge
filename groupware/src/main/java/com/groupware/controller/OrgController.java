package com.groupware.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.server.ResponseStatusException;

import com.groupware.dto.DepartmentDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.EmployeeMapper;
import com.groupware.security.CustomUserDetails;

import lombok.RequiredArgsConstructor;

//  조직도 화면 렌더링과 직원 상세 모달 API만 담당한다.

@Controller
@RequiredArgsConstructor
public class OrgController {

	private final EmployeeMapper employeeMapper;
	
	
	
//  조직도 첫 화면을 서버에서 렌더링한다.
//  deptId가 없으면 전체 재직자, 있으면 선택한 부서의 재직자만 Thymeleaf Model에 담는다.
     
    @GetMapping({"/org"})
    // 브라우저가 위 주소로 GET 요청을 보내면 이 메서드를 실행하라는 뜻.
    public String org(
    		@RequestParam(value = "deptId", required = false) Integer deptId,
    		// URL에 있는 deptId 파라미터를 받는 부분이다. 
    		// required = false는 이 값이 없어도 된다는 뜻이야.
    		// Integer을 사용하는 이유 - int는 null을 가질 수 없지만, Integer는 null을 가질 수 있다.
            // value = "deptId"를 직접 적으면 컴파일된 클래스에 변수명 정보가 없어도
            // Spring이 URL의 ?deptId=값과 이 deptId 변수를 정확히 연결할 수 있다.
    		
            @AuthenticationPrincipal CustomUserDetails user, 
            // Spring Security가 로그인한 사용자를 CustomUserDetails 객체로 관리하고, 그 객체를 user 변수에 넣어 준다.
            // 이 값을 사용해 현재 로그인 사용자의 직원 번호를 가져온다.
            
            Model model) // Thymeleaf 화면에 전달할 데이터를 담는 객체.
    	{
    	
        List<DepartmentDTO> departments = employeeMapper.findDepartments();
        // 조직도 왼쪽의 부서 목록을 만들기 위해 필요.
        model.addAttribute("departments", departments);
        // 방금 DB에서 가져온 부서 목록을 Thymeleaf에 전달한다.
        
        
        model.addAttribute("employees", employeeMapper.findActiveEmployeesByDepartment(deptId));
        // 전체보기라면 null
        model.addAttribute("selectedDeptId", deptId);
        model.addAttribute("selectedDeptName", departments.stream()
        		// stream()은 List, Set 같은 컬렉션이나 배열 데이터를 
        		// 함수형 스타일로 간편하고 직관적으로 처리하기 위한 API이다.
                .filter(department -> deptId != null && department.getDeptId() == deptId)
                // 조건에 맞는 부서만 남김.
                // 부서 목록 안의 부서 ID가 현재 선택된 deptId와 같은지 확인한.
                //ex) deptId가 2라면 부서 목록 중에서 deptId == 2인 부서만 남기는 것이다.
                
                .map(DepartmentDTO::getDeptName)
                // 그 부서 객체 전체가 아니라 부서 이름만 꺼냄.
                
                .findFirst()
                // 조건에 맞는 부서 하나만 가져옴. 
                
                // 자바가 기본적으로 제공하는 기본 API.
                
                .orElse(null));
        		// 맞는 부서가 없으면 null을 집어넣는다.
        model.addAttribute("currentEmployeeId", user.getEmployeeDTO().getEmployeeId());
        return "org/org";
    }

    // 조직도 직원 행 클릭 시 모달에 채울 재직 직원 한 명을 JSON을 반환한다. 
    @GetMapping("/org/member/{employeeId}")
    
    @ResponseBody
    // 이 메서드의 반환값을 화면 이름으로 해석하지 말고, 응답 데이터로 그대로 보내라는 뜻이다.
    // return employee를 하면 employee.jsp 같은 화면으로 이동하는 게 아니라, 
    // EmployeeDTO 객체를 JSON 형태로 변환해서 브라우저에 보내라는 뜻이다.
    
    public EmployeeDTO orgMember(@PathVariable("employeeId") int employeeId) {
    	// 주소에 들어온 {employeeId} 값을 메서드 파라미터로 받는 것이다.
        // "employeeId"를 직접 적으면 컴파일 후 변수명 정보가 없어도
        // URL의 /org/member/{employeeId} 부분과 employeeId 변수를 정확히 연결할 수 있다.
    	
        EmployeeDTO employee = employeeMapper.findActiveEmployeeById(employeeId);
        // employeeMapper를 통해 DB에서 해당 직원 정보를 찾는 코드이다.
        
        if (employee == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "직원을 찾을 수 없습니다.");
            // null을 반환하지 않고 404 NOT_FOUND 값을 반환한다.
            
        }
        return employee;
    }
}
    
    
    
    
    
    
